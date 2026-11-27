/**
 * #404 (spec #383, #345 Q7): `docs/operations/account-deletion.md`, run as written. Each SQL block in the document
 * starts with `-- step: <name>`; the tests run those blocks, with the operator's variables filled in, on the local
 * lane_test database, against people and workspaces made through the real auth route.
 */
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { claimFreeRequests, decideFreeRequests, readFreeRequests } from "@/lib/billing"
import { AuthBrowser, authRouteTestFile, codeOf, doorData, doorInvite, fakeOutbound, signIn, signInWithGoogle, switchOnAuthRoute, type GoogleProfile, type Outbound, type TestPerson } from "@/test/auth-route-browser"

const DOMAIN = "account-deletion.test"
const { connection: sql, signedIn, createWorkspace, join } = authRouteTestFile(DOMAIN)
const PROCEDURE = readFileSync(path.resolve(__dirname, "../../docs/operations/account-deletion.md"), "utf8")

let outbound: Outbound
beforeEach(() => {
  switchOnAuthRoute()
  outbound = fakeOutbound()
})

// Deleted people no longer have an address at DOMAIN, so the shared clean-up can't find them.
afterAll(async () => {
  await sql`delete from organizations where slug like ${`${DOMAIN.replace(/[^a-z0-9]+/g, "-")}-%`}`
  await sql`delete from profiles where email like 'former-member-%@deleted.invalid'`
})

/** Runs one of the document's SQL blocks, stopping at the first error as `ON_ERROR_STOP` does. Answers each statement's rows. */
async function run(step: string, variables: Record<string, string>): Promise<Record<string, unknown>[][]> {
  const block = [...PROCEDURE.matchAll(/```sql\n([\s\S]*?)```/g)].map((match) => match[1]).find((text) => text.startsWith(`-- step: ${step}\n`))
  if (!block) throw new Error(`The procedure has no step called ${step}`)
  const text = block.replace(/:'(\w+)'/g, (_, name: string) => {
    if (!(name in variables)) throw new Error(`The step ${step} needs ${name}`)
    return `'${variables[name].replaceAll("'", "''")}'`
  })
  try {
    const results = await sql.unsafe(text)
    return (Array.isArray(results[0]) ? (results as unknown as Record<string, unknown>[][]) : [results]).map((rows) => [...rows])
  } catch (error) {
    await sql.unsafe("rollback")
    throw error
  }
}

type Someone = { person: TestPerson; browser: AuthBrowser; userId: string }
const variablesFor = ({ person, userId }: Someone) => ({ person_id: userId, person_email: person.email })

async function fileRequest(orgId: string, userId: string, title: string) {
  const [{ id }] = await sql`insert into requests (org_id, title, description, created_by) values (${orgId}, ${title}, 'A problem', ${userId}) returning id`
  await sql`insert into comments (request_id, author_id, body) values (${id}, ${userId}, ${`Comment on ${title}`})`
  return id as string
}

it("works entirely in Lane: no step is in Clerk", () => {
  expect(PROCEDURE).not.toMatch(/clerk/i)
})

describe("deleting a person's account", () => {
  /** A workspace with two people to delete and an Admin who stays, and everything Lane stores about the two. */
  async function twoLeavers() {
    const stayer = await signedIn(outbound, "stayer")
    const orgId = await createWorkspace(stayer.browser)
    const leavers: (Someone & { google: GoogleProfile })[] = []
    for (const label of ["wren", "ash"]) {
      const leaver = await join(outbound, stayer.browser, "admin", label)
      const google = { sub: randomUUID(), email: leaver.person.email, email_verified: true, name: leaver.person.name }
      await signInWithGoogle(new AuthBrowser(), outbound, google)
      // Another workspace invites them and they haven't answered; they invite someone who hasn't answered either.
      const elsewhere = await signedIn(outbound, `elsewhere-${label}`)
      await createWorkspace(elsewhere.browser)
      doorData(await doorInvite(elsewhere.browser, { email: leaver.person.email, role: "member" }))
      doorData(await doorInvite(leaver.browser, { email: `invited-by-${label}@${DOMAIN}`, role: "member" }))
      // A sign-in code and a reset code wait in their mailbox.
      expect((await new AuthBrowser().post("/email-otp/send-verification-otp", { email: leaver.person.email, type: "sign-in" })).status).toBe(200)
      expect((await new AuthBrowser().post("/email-otp/request-password-reset", { email: leaver.person.email })).status).toBe(200)
      await fileRequest(orgId, leaver.userId, `${label}'s Request`)
      leavers.push({ ...leaver, google })
    }
    await sql`update profiles set last_workspace_id = ${orgId} where id in ${sql(leavers.map((leaver) => leaver.userId))}`
    return { orgId, stayer, leavers }
  }

  async function leftOf({ userId, person }: Someone) {
    const [counts] = await sql`
      select
        (select count(*)::int from session where user_id = ${userId}) as sessions,
        (select count(*)::int from account where user_id = ${userId}) as accounts,
        (select count(*)::int from member where user_id = ${userId}) as members,
        (select count(*)::int from invitation where status = 'pending' and (inviter_id = ${userId} or email = ${person.email})) as pending_invitations,
        (select count(*)::int from invitation where email = ${person.email}) as invitations_to_them,
        (select count(*)::int from verification where identifier like ${`%-otp-${person.email}`}) as codes
    `
    return counts
  }

  it("leaves no session, sign-in method, membership, pending invitation or code for two people, deleted one after the other", async () => {
    const { leavers, stayer } = await twoLeavers()
    for (const leaver of leavers)
      expect(await leftOf(leaver)).toEqual({ sessions: expect.any(Number), accounts: 2, members: 1, pending_invitations: 2, invitations_to_them: 2, codes: 2 })
    const stayerBefore = await leftOf(stayer)

    for (const leaver of leavers) {
      await run("delete-person", variablesFor(leaver))
      expect(await leftOf(leaver)).toEqual({ sessions: 0, accounts: 0, members: 0, pending_invitations: 0, invitations_to_them: 0, codes: 0 })
    }
    expect(await leftOf(stayer)).toEqual(stayerBefore)
  })

  it("has a check that finds what is left before the deletion and nothing after it", async () => {
    const { leavers: [leaver] } = await twoLeavers()
    const stillThere = async () => (await run("check-person", variablesFor(leaver)))[0].filter((row) => Number(row.left_over) > 0).map((row) => row.what)

    expect(await stillThere()).toEqual(expect.arrayContaining(["sessions", "sign-in methods", "memberships", "pending invitations", "stored codes", "profiles with the address"]))
    await run("delete-person", variablesFor(leaver))
    expect(await stillThere()).toEqual([])
  })

  it("keeps both people's Requests and comments under Former member, with a different placeholder email each", async () => {
    const { leavers, orgId } = await twoLeavers()
    for (const leaver of leavers) await run("delete-person", variablesFor(leaver))

    expect(await sql`
      select r.title, requester.full_name as requester, c.body, author.full_name as author
      from requests r join profiles requester on requester.id = r.created_by
      join comments c on c.request_id = r.id join profiles author on author.id = c.author_id
      where r.org_id = ${orgId} order by r.request_number
    `).toEqual([
      { title: "wren's Request", requester: "Former member", body: "Comment on wren's Request", author: "Former member" },
      { title: "ash's Request", requester: "Former member", body: "Comment on ash's Request", author: "Former member" },
    ])
    const profiles = await sql`select id, email, email_verified, image, last_workspace_id from profiles where id in ${sql(leavers.map((leaver) => leaver.userId))}`
    expect(profiles).toHaveLength(2)
    expect(new Set(profiles.map((profile) => profile.email)).size).toBe(2)
    for (const profile of profiles)
      expect(profile).toMatchObject({ email: `former-member-${profile.id}@deleted.invalid`, email_verified: false, image: null, last_workspace_id: null })
  })

  it("leaves neither person any way to sign in", async () => {
    const { leavers } = await twoLeavers()
    const codes = leavers.map((leaver) => outbound.emailsTo(leaver.person.email).slice(-2).map((email) => email.text.match(/\b\d{6}\b/)![0]))
    for (const leaver of leavers) await run("delete-person", variablesFor(leaver))

    for (const [index, { person, browser, userId, google }] of leavers.entries()) {
      expect((await browser.get("/get-session")).body).toBeNull()
      const [{ email: placeholder }] = await sql`select email from profiles where id = ${userId}`
      for (const email of [person.email, placeholder as string])
        expect(codeOf(await signIn(new AuthBrowser(), { ...person, email }))).toBe("INVALID_EMAIL_OR_PASSWORD")
      expect(codeOf(await new AuthBrowser().post("/email-otp/send-verification-otp", { email: person.email, type: "sign-in" }))).toBe("NO_ACCOUNT")
      const [signInCode, resetCode] = codes[index]
      expect((await new AuthBrowser().post("/sign-in/email-otp", { email: person.email, otp: signInCode })).status).toBe(400)
      expect((await new AuthBrowser().post("/email-otp/reset-password", { email: person.email, otp: resetCode, password: "a-new-password-for-nobody" })).status).toBe(400)
      // Google starts a new account for the address; it never reaches the kept profile.
      await signInWithGoogle(new AuthBrowser(), outbound, google)
      const [started] = await sql`select user_id from account where account_id = ${google.sub}`
      expect(started.user_id).not.toBe(userId)
      expect(await sql`select id from session where user_id = ${userId}`).toEqual([])
    }
  })

  it("removes the tokens Google returned with the sign-in method that holds them", async () => {
    const { leavers: [leaver] } = await twoLeavers()
    const tokens = () => sql`select access_token, id_token from account where user_id = ${leaver.userId} and provider_id = 'google'`
    expect(await tokens()).toEqual([{ access_token: expect.any(String), id_token: expect.any(String) }])
    await run("delete-person", variablesFor(leaver))
    expect(await tokens()).toEqual([])
  })

  it("deletes both people's own settings in every workspace, and nobody else's", async () => {
    const stayer = await signedIn(outbound, "settings-stayer")
    const workspaces = [await createWorkspace(stayer.browser), await createWorkspace(stayer.browser)]
    const leavers = [await join(outbound, stayer.browser, "member", "birch"), await join(outbound, stayer.browser, "member", "rowan")]
    for (const orgId of workspaces) {
      const requestId = await fileRequest(orgId, stayer.userId, "Needs someone")
      for (const { userId } of [stayer, ...leavers]) {
        await sql`insert into delivery_preferences (org_id, user_id, channel) values (${orgId}, ${userId}, 'off')`
        await sql`insert into first_run_progress (org_id, user_id, guide) values (${orgId}, ${userId}, 'joined')`
        await sql`insert into saved_views (org_id, owner_id, name, filters) values (${orgId}, ${userId}, 'Mine', ${sql.json({ status: "done" })})`
        await sql`insert into delivery_log (org_id, user_id, request_id, item_key, channel, outcome) values (${orgId}, ${userId}, ${requestId}, 'review', 'email', 'would_send')`
      }
    }
    const settingsOf = async (userId: string) => {
      const [rows] = await sql`
        select
          (select count(*)::int from delivery_preferences where user_id = ${userId}) as delivery_preferences,
          (select count(*)::int from first_run_progress where user_id = ${userId}) as first_run_progress,
          (select count(*)::int from saved_views where owner_id = ${userId}) as saved_views,
          (select count(*)::int from delivery_log where user_id = ${userId}) as delivery_log`
      return { ...rows }
    }
    const everyTable = { delivery_preferences: 2, first_run_progress: 2, saved_views: 2, delivery_log: 2 }
    for (const { userId } of leavers) expect(await settingsOf(userId)).toEqual(everyTable)

    for (let time = 0; time < 2; time++) for (const leaver of leavers) await run("delete-person", variablesFor(leaver))

    for (const { userId } of leavers) expect(await settingsOf(userId)).toEqual({ delivery_preferences: 0, first_run_progress: 0, saved_views: 0, delivery_log: 0 })
    expect(await settingsOf(stayer.userId)).toEqual(everyTable)
  })

  it("lists the workspaces the person created whose Free Requests were never decided, until they are", async () => {
    const creator = await signedIn(outbound, "undecided-creator")
    const [decided, undecided, neverCounted] = [await createWorkspace(creator.browser), await createWorkspace(creator.browser), await createWorkspace(creator.browser)]
    const someoneElse = await signedIn(outbound, "undecided-other")
    const notTheirs = await createWorkspace(someoneElse.browser)
    // As Onboarding saves the creator; only `decided` then had its Free Requests decided. `neverCounted` has no billing row.
    await sql`update organizations set owner_id = ${creator.userId} where id in ${sql([decided, undecided, neverCounted])}`
    await sql`update organizations set owner_id = ${someoneElse.userId} where id = ${notTheirs}`
    for (const orgId of [decided, undecided, notTheirs]) await fileRequest(orgId, creator.userId, "Counted")
    await claimFreeRequests({ orgId: decided }, `founder@${randomUUID().slice(0, 8)}.test`)

    const undecidedOf = async () => (await run("look-up", variablesFor(creator)))[1].map((row) => row.id).sort()
    expect(await undecidedOf()).toEqual([undecided, neverCounted].sort())
    for (const orgId of [undecided, neverCounted]) await decideFreeRequests({ orgId })
    expect(await undecidedOf()).toEqual([])
  })

  it("finds the person, and names the workspaces whose only Admin they are", async () => {
    const admin = await signedIn(outbound, "only-admin")
    const alone = await createWorkspace(admin.browser)
    const shared = await createWorkspace(admin.browser)
    const member = await join(outbound, admin.browser, "member", "of-shared")

    const [found] = await run("find-person", { person_email: admin.person.email.toUpperCase() })
    expect(found.map((row) => row.id)).toEqual([admin.userId])

    const onlyAdminOf = async () => (await run("only-admin", variablesFor(admin)))[0].map((row) => ({ id: row.id, others: Number(row.other_people) }))
    expect(await onlyAdminOf()).toEqual(expect.arrayContaining([{ id: alone, others: 0 }, { id: shared, others: 1 }]))
    await run("make-admin", { org_id: shared, new_admin_id: member.userId })
    expect(await onlyAdminOf()).toEqual([{ id: alone, others: 0 }])
  })
})

describe("what a deleted person's name and address are replaced in", () => {
  const reviewer = (userId: string, name: string) => ({ id: randomUUID(), nominee: { kind: "member", userId }, displayNameAtSelection: name, addedBy: userId, note: `For ${name}`, decision: { kind: "concern", actorId: userId, at: "2026-11-24T00:00:00.000Z", reason: "Too slow" } })
  type Reviewer = ReturnType<typeof reviewer>

  /** Two people to delete and one who stays, all Reviewers of one Request, in the shapes the reviewer actions save. */
  async function reviewed() {
    const stayer = await signedIn(outbound, "review-stayer")
    const orgId = await createWorkspace(stayer.browser)
    const leavers: Someone[] = [await join(outbound, stayer.browser, "member", "fern"), await join(outbound, stayer.browser, "member", "oak")]
    const requestId = await fileRequest(orgId, stayer.userId, "Reviewed")
    const [fern, oak] = leavers.map((leaver) => reviewer(leaver.userId, leaver.person.name))
    const stays = reviewer(stayer.userId, stayer.person.name)
    await sql`insert into request_agreements (request_id, org_id, reviewers) values (${requestId}, ${orgId}, ${sql.json([fern, stays, oak])})`
    const row = (reviewers: Reviewer[]) => ({ requestId, orgId, reviewers })
    const payloads = [
      { version: 1, fingerprint: "a".repeat(64), input: { nominees: [{ kind: "member", userId: fern.nominee.userId }], note: "" }, before: null, after: row([fern]), result: { success: true, revision: 1 } },
      { version: 1, fingerprint: "b".repeat(64), input: { reviewerId: stays.id }, before: row([fern, stays, oak]), after: row([fern, oak]), result: { success: true, revision: 2 } },
      { version: 1, fingerprint: "c".repeat(64), input: {}, before: row([]), after: row([stays]), result: { success: true, revision: 3 } },
    ]
    for (const [index, payload] of payloads.entries())
      await sql`insert into request_agreement_events (org_id, request_id, revision, operation_id, actor_id, kind, payload) values (${orgId}, ${requestId}, ${index + 1}, ${randomUUID()}, ${stayer.userId}, 'reviewers_added', ${sql.json(payload)})`
    const stored = async () => ({
      reviewers: (await sql`select reviewers from request_agreements where request_id = ${requestId}`)[0].reviewers as Reviewer[],
      payloads: (await sql`select payload from request_agreement_events where request_id = ${requestId} order by revision`).map((event) => event.payload as unknown),
    })
    return { orgId, requestId, leavers, fern, oak, stays, row, payloads, stored }
  }
  const former = (someone: Reviewer) => ({ ...someone, displayNameAtSelection: "Former member" })

  it("a Reviewer's name, in the Request's Reviewers and their history, one person at a time and nobody else's", async () => {
    const { leavers, fern, oak, stays, row, payloads, stored } = await reviewed()

    await run("delete-person", variablesFor(leavers[0]))
    expect(await stored()).toEqual({
      reviewers: [former(fern), stays, oak],
      payloads: [
        { ...payloads[0], after: row([former(fern)]) },
        { ...payloads[1], before: row([former(fern), stays, oak]), after: row([former(fern), oak]) },
        payloads[2],
      ],
    })

    await run("delete-person", variablesFor(leavers[1]))
    const both = {
      reviewers: [former(fern), stays, former(oak)],
      payloads: [
        { ...payloads[0], after: row([former(fern)]) },
        { ...payloads[1], before: row([former(fern), stays, former(oak)]), after: row([former(fern), former(oak)]) },
        payloads[2],
      ],
    }
    expect(await stored()).toEqual(both)
    for (const leaver of leavers) await run("delete-person", variablesFor(leaver))
    expect(await stored()).toEqual(both)
  })

  /** A person whose address is a personal one, with two workspaces sharing its Free Requests and 1 and 2 of them used. */
  async function personalCreator(label: string, address: string) {
    const creator = await signedIn(outbound, label)
    await sql`update profiles set email = ${address} where id = ${creator.userId}`
    const workspaces = [await createWorkspace(creator.browser), await createWorkspace(creator.browser)]
    for (const [index, orgId] of workspaces.entries()) {
      for (let used = 0; used <= index; used++) await fileRequest(orgId, creator.userId, `${label} ${index}.${used}`)
      await claimFreeRequests({ orgId }, address)
    }
    return { ...creator, person: { ...creator.person, email: address }, workspaces }
  }
  const keysOf = async (workspaces: string[]) => ({
    billing: (await sql`select allowance_key, holds_allowance, free_requests_used from workspace_billing where org_id in ${sql(workspaces)} order by free_requests_used`).map((row) => ({ ...row })),
    allowances: (await sql`select allowance_key, kind from free_request_allowances where org_id in ${sql(workspaces)}`).map((row) => ({ ...row })),
  })

  it("a personal address kept as a Free Requests key, keeping the counts and the sharing", async () => {
    const tag = randomUUID().slice(0, 8)
    const people = [await personalCreator("ivy", `i.vy.${tag}+lane@googlemail.com`), await personalCreator("elm", `elm-${tag}+work@fastmail.com`)]
    const other = await personalCreator("stays", `stays-${tag}@gmail.com`)
    const otherBefore = await keysOf(other.workspaces)
    expect((await keysOf(people[0].workspaces)).allowances).toEqual([{ allowance_key: `ivy${tag}@gmail.com`, kind: "personal_email" }])
    expect((await keysOf(people[1].workspaces)).allowances).toEqual([{ allowance_key: `elm-${tag}@fastmail.com`, kind: "personal_email" }])
    const free = async () => Promise.all(people.flatMap(({ workspaces }) => workspaces).map((orgId) => readFreeRequests({ orgId })))
    const counts = (await free()).map(({ planState, free: { total, used, left, usedElsewhere } }) => ({ planState, total, used, left, elsewhere: usedElsewhere && { kind: usedElsewhere.kind, used: usedElsewhere.used } }))
    expect(counts.map(({ left }) => left)).toEqual([1, 1, 1, 1])

    for (const someone of people) await run("delete-person", variablesFor(someone))
    const after = [await keysOf(people[0].workspaces), await keysOf(people[1].workspaces)]
    for (const { billing, allowances } of after) {
      expect(allowances).toEqual([{ allowance_key: expect.stringMatching(/^former-member-[0-9a-f-]{36}@deleted\.invalid$/), kind: "personal_email" }])
      expect(billing).toEqual([
        { allowance_key: allowances[0].allowance_key, holds_allowance: true, free_requests_used: 1 },
        { allowance_key: allowances[0].allowance_key, holds_allowance: false, free_requests_used: 2 },
      ])
    }
    expect(after[0].allowances[0].allowance_key).not.toBe(after[1].allowances[0].allowance_key)
    expect((await free()).map(({ planState, free: { total, used, left, usedElsewhere } }) => ({ planState, total, used, left, elsewhere: usedElsewhere && { kind: usedElsewhere.kind, used: usedElsewhere.used } }))).toEqual(counts)
    expect(await keysOf(other.workspaces)).toEqual(otherBefore)

    for (const someone of people) await run("delete-person", variablesFor(someone))
    expect([await keysOf(people[0].workspaces), await keysOf(people[1].workspaces)]).toEqual(after)
  })

  it("a personal address still on another workspace when the one that held it is gone", async () => {
    const ash = await personalCreator("gone-holder", `holder-${randomUUID().slice(0, 8)}@gmail.com`)
    await run("delete-workspace", { org_id: ash.workspaces[0] })
    await run("delete-person", variablesFor(ash))
    expect((await keysOf([ash.workspaces[1]])).billing[0].allowance_key).toMatch(/^former-member-[0-9a-f-]{36}@deleted\.invalid$/)
  })

  it("but not a company domain's key, which others share", async () => {
    const { userId, person, browser } = await signedIn(outbound, "company")
    const orgId = await createWorkspace(browser)
    const domain = `${randomUUID().slice(0, 8)}.test`
    await claimFreeRequests({ orgId }, `someone@${domain}`)
    await sql`update profiles set email = ${`someone@${domain}`} where id = ${userId}`
    const before = await keysOf([orgId])
    await run("delete-person", { person_id: userId, person_email: person.email })
    expect(await keysOf([orgId])).toEqual(before)
    expect(before.allowances).toEqual([{ allowance_key: domain, kind: "company_domain" }])
  })

  it("and the check sees both, and that the protections are back on", async () => {
    const { leavers: [leaver], orgId, requestId } = await reviewed()
    const address = `checked-${randomUUID().slice(0, 8)}@gmail.com`
    await sql`update profiles set email = ${address} where id = ${leaver.userId}`
    await claimFreeRequests({ orgId }, address)
    const variables = { person_id: leaver.userId, person_email: address }
    const stillThere = async () => (await run("check-person", variables))[0].filter((row) => Number(row.left_over) !== 0).map((row) => row.what)

    expect(await stillThere()).toEqual(expect.arrayContaining(["reviews still naming them", "Free Requests keys with the address"]))
    await run("delete-person", variables)
    expect(await stillThere()).toEqual([])
    await expect(sql`update request_agreement_events set kind = 'reviewed' where request_id = ${requestId}`).rejects.toThrow("Agreement events are immutable")
    await expect(sql`update workspace_billing set allowance_key = 'else@gmail.com' where org_id = ${orgId}`).rejects.toThrow("allowance is decided once")

    await sql`alter table workspace_billing disable trigger protect_workspace_billing`
    try {
      expect(await stillThere()).toEqual(["protections switched off"])
    } finally {
      await sql`alter table workspace_billing enable trigger protect_workspace_billing`
    }
  })
})

describe("deleting a workspace", () => {
  // Released and Closed Requests hold their workspace, so the shared clean-up can't delete it.
  const filled: string[] = []
  afterAll(async () => {
    for (const orgId of filled) await run("delete-workspace", { org_id: orgId })
  })

  /** A workspace with a row in every table that holds workspace rows, a released Request and a Closed one included. */
  async function filledWorkspace(label: string) {
    const admin = await signedIn(outbound, label)
    const orgId = await createWorkspace(admin.browser)
    filled.push(orgId)
    const userId = admin.userId
    const { userId: memberId } = await join(outbound, admin.browser, "member", `${label}-member`)
    doorData(await doorInvite(admin.browser, { email: `pending-${label}@${DOMAIN}`, role: "guest" }))
    const open = await fileRequest(orgId, userId, `${label} open`)
    const released = await fileRequest(orgId, memberId, `${label} released`)
    const closed = await fileRequest(orgId, userId, `${label} closed`)

    const at = "2026-11-24T00:00:00.000Z"
    const fact = { operationId: randomUUID(), fingerprint: "a".repeat(64), actorId: userId, revision: 1 }
    const releaseState = { version: 1, ownerId: userId, release: null, history: [{ ...fact, at, input: { kind: "transfer" }, previousRelease: null, release: null, previousOwnerId: userId, ownerId: userId }] }
    await sql`update requests set status = 'done', release_state = ${sql.json(releaseState)}, agreement_revision = 1 where id = ${released}`
    await sql`update requests set status = 'in_progress' where id = ${closed}`
    await sql`update requests set exception_closure = ${sql.json({ ...fact, version: 1, kind: "exception", reasonCode: "other", reason: "Never launched", ownerId: userId, closedAt: at, release: null })}, agreement_revision = 1 where id = ${closed}`
    await sql`insert into requests (org_id, title, description, created_by, follow_up_of) values (${orgId}, ${`${label} follow-up`}, 'More', ${userId}, ${closed})`

    await sql`insert into projects (org_id, name, created_by) values (${orgId}, ${label}, ${userId})`
    await sql`insert into workspace_labels (org_id, name, colour, created_by) values (${orgId}, ${label}, 'blue', ${userId})`
    await sql`insert into notifications (user_id, org_id, type, request_id, actor_id) values (${memberId}, ${orgId}, 'comment_added', ${open}, ${userId})`
    await sql`insert into request_attachments (id, org_id, request_id, uploaded_by, storage_path, file_name, mime_type, size_bytes) values (${randomUUID()}, ${orgId}, ${open}, ${userId}, ${`${orgId}/${open}/${randomUUID()}`}, 'brief.pdf', 'application/pdf', 10)`
    await sql`insert into request_agreements (request_id, org_id) values (${open}, ${orgId})`
    await sql`insert into request_agreement_events (org_id, request_id, revision, operation_id, actor_id, kind, payload) values (${orgId}, ${open}, 1, ${randomUUID()}, ${userId}, 'reviewer_removed', ${sql.json({ version: 1, fingerprint: "a".repeat(64), input: {}, result: { success: true, revision: 1 } })})`
    await sql`insert into request_expected_impact_revisions (org_id, request_id, revision, no_measurable_impact_reason, author_id, recorded_as) values (${orgId}, ${open}, 2, 'Nothing to measure', ${userId}, 'revised')`
    const [{ id: definition }] = await sql`insert into metric_definitions (org_id, name, unit, created_by) values (${orgId}, 'Signups', 'count', ${userId}) returning id`
    await sql`insert into metric_definition_history (org_id, definition_id, revision, kind, after, author_id) values (${orgId}, ${definition}, 1, 'created', ${sql.json({ name: "Signups" })}, ${userId})`
    await sql`insert into metric_definition_aliases (org_id, definition_id, typed_name, unit) values (${orgId}, ${definition}, 'signups', 'count')`
    const group = randomUUID()
    await sql`insert into same_problem_members (org_id, request_id, group_id, added_by) values (${orgId}, ${open}, ${group}, ${userId}), (${orgId}, ${released}, ${group}, ${userId})`
    await sql`insert into same_problem_events (org_id, request_id, kind, other_request_id, other_request_number, actor_id) values (${orgId}, ${open}, 'linked', ${released}, 2, ${userId})`
    await sql`insert into saved_views (org_id, owner_id, name, filters) values (${orgId}, ${memberId}, 'Mine', ${sql.json({ status: "done", project: "all" })})`
    await sql`insert into quarter_notes (org_id, year, quarter, body, edited_by) values (${orgId}, 2026, 4, 'Note', ${userId})`
    await sql`insert into first_run_progress (org_id, user_id, guide) values (${orgId}, ${memberId}, 'joined')`
    await sql`insert into delivery_preferences (org_id, user_id, channel) values (${orgId}, ${memberId}, 'off')`
    await sql`insert into delivery_log (org_id, user_id, request_id, item_key, channel, outcome) values (${orgId}, ${memberId}, ${open}, 'review', 'email', 'would_send')`
    await sql`insert into slack_connections (org_id, team_id, team_name, token_ciphertext, connected_by) values (${orgId}, 'T1', 'Team', 'v1:a:b:c', ${userId})`
    await sql`insert into workspace_billing (org_id) values (${orgId}) on conflict do nothing`
    await sql`insert into free_request_allowances (allowance_key, kind, org_id) values (${`${randomUUID()}.test`}, 'company_domain', ${orgId})`
    return { orgId, admin }
  }

  /** Every row of the workspace, by table: its own row, every table with a workspace column, and its Requests' comments. */
  async function rowsOf(orgId: string) {
    const columns = await sql`
      select c.table_name, c.column_name from information_schema.columns c
      join pg_tables t on t.schemaname = c.table_schema and t.tablename = c.table_name
      where c.table_schema = 'public' and c.column_name in ('org_id', 'organization_id') order by c.table_name`
    const rows: Record<string, readonly unknown[]> = {
      organizations: await sql`select * from organizations where id = ${orgId}`,
      comments: await sql`select comments.* from comments join requests on requests.id = comments.request_id where requests.org_id = ${orgId} order by comments.id`,
    }
    for (const { table_name: table, column_name: column } of columns)
      rows[table] = (await sql`select to_jsonb(t) as row from ${sql(table)} t where ${sql(column)} = ${orgId} order by to_jsonb(t)::text`).map((found) => found.row)
    return rows
  }
  const tablesWithRows = (rows: Record<string, readonly unknown[]>) => Object.keys(rows).filter((table) => rows[table].length > 0).sort()

  it("leaves no row for the workspace, with released and Closed Requests in it, and touches no other workspace's rows", async () => {
    const { orgId, admin } = await filledWorkspace("closing")
    const { orgId: otherId } = await filledWorkspace("staying")
    const [before, otherBefore] = [await rowsOf(orgId), await rowsOf(otherId)]
    expect(tablesWithRows(before)).toEqual(Object.keys(before).sort())
    const requestIds = (await sql`select id from requests where org_id = ${orgId}`).map((row) => row.id)

    const [found] = await run("find-workspace", { person_email: admin.person.email })
    expect(found.map((row) => [row.id, Number(row.people)])).toEqual([[orgId, 2]])
    await run("delete-workspace", { org_id: orgId })

    expect(tablesWithRows(await rowsOf(orgId))).toEqual([])
    expect(await sql`select id from comments where request_id in ${sql(requestIds)}`).toEqual([])
    expect(await rowsOf(otherId)).toEqual(otherBefore)
    const [[check]] = await run("check-workspace", { org_id: orgId })
    expect(Object.values(check).map(Number)).toEqual([0, 0, 2])
  })

  it("leaves the protections on other workspaces' records as they were", async () => {
    const { orgId } = await filledWorkspace("protected")
    const { orgId: goneId } = await filledWorkspace("gone")
    await run("delete-workspace", { org_id: goneId })
    await expect(sql`delete from requests where org_id = ${orgId} and release_state is not null`).rejects.toThrow("Release history is immutable")
    await expect(sql`delete from requests where org_id = ${orgId} and exception_closure is not null`).rejects.toThrow("Closed Request is immutable")
  })

  it("keeps the accounts of the people who were in it", async () => {
    const { orgId, admin } = await filledWorkspace("people")
    await run("delete-workspace", { org_id: orgId })
    expect(await sql`select full_name, email from profiles where id = ${admin.userId}`).toEqual([{ full_name: admin.person.name, email: admin.person.email }])
    expect((await signIn(new AuthBrowser(), admin.person)).status).toBe(200)
  })
})
