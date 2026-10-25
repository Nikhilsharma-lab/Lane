import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, afterEach, expect, it, vi } from 'vitest';
const session = vi.hoisted(() => ({ userId: 'outcome_owner', orgId: 'org_outcome', orgRole: 'org:member' }));
const everyone = ['outcome_owner', 'outcome_pm', 'outcome_designer', 'outcome_developer', 'outcome_admin', 'outcome_next'];
const roster = vi.hoisted(() => ({ ids: [] as string[] }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@clerk/nextjs/server', () => ({
    auth: async () => ({ ...session }),
    clerkClient: async () => ({ organizations: { getOrganizationMembershipList: async () => ({ totalCount: roster.ids.length, data: roster.ids.map(userId => ({ organization: { id: 'org_outcome' }, role: userId === 'outcome_admin' ? 'org:admin' : 'org:member', publicUserData: { userId, firstName: userId, identifier: userId + '@example.test' } })) }) } }),
}));
const connection = postgres(process.env.DATABASE_URL!, { max: 6, prepare: false });
const orgId = 'org_outcome';
beforeAll(async () => {
    await connection `insert into organizations(id,name,slug) values (${orgId},'Outcome tests','outcome-tests')`;
    await connection `insert into organizations(id,name,slug) values ('org_outcome_foreign','Foreign outcome tests','outcome-foreign')`;
    for (const id of everyone)
        await connection `insert into profiles(id,full_name,email) values (${id},${id},${id + '@example.test'})`;
});
const reset = () => { vi.useRealTimers(); session.userId = 'outcome_owner'; session.orgId = orgId; session.orgRole = 'org:member'; roster.ids = [...everyone]; };
reset();
afterEach(reset);
afterAll(() => connection.end());
const context = (requestId: string, expectedRevision: number) => ({ orgId, requestId, expectedRevision, operationId: randomUUID() });
const conversion = { kind: 'measurement', version: 2, primary: { key: 'conversion', name: '', unit: 'percent', current: 50, target: 80, noBaseline: false, check: '' }, measurement: { audience: 'all', platform: 'all', windowDays: 7, exactDates: false, startDate: '', endDate: '' }, guardrails: [{ key: 'error', name: '', unit: 'percent', current: 2, noBaseline: false, operator: 'at_most', limit: 3 }] };
const measured = { kind: 'measured', primary: { kind: 'numeric', actual: 62 }, guardrails: [2.5], evidence: 'Analytics dashboard export, 21–28 October', observedFrom: '2026-10-21', observedTo: '2026-10-28' };
async function at(iso: string) {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(iso));
}
/** A Done Request, optionally released on 21 October (due 28 October). */
async function fixture({ impact = conversion as postgres.JSONValue, released = true } = {}) {
    const [row] = await connection `insert into requests(org_id,title,description,affected_people,created_by,status,priority,expected_impact,created_at) values (${orgId},'Checkout problem','Unable to pay','All shoppers','outcome_owner','done','high',${connection.json(impact)},'2026-10-01T00:00:00Z') returning *`;
    if (released) {
        const releaseApi = await import('./release-actions');
        const result = await releaseApi.changeRequestRelease(context(row.id, 0), { kind: 'release', exposureDate: '2026-10-21', evidence: 'Full rollout in release log', audienceConfirmed: true, valueBeforeRelease: { value: 50, unit: '%' } });
        if (!('success' in result)) throw Error(result.error);
    }
    return row.id as string;
}
it('closes a measured outcome only from the due date, keeping baseline and target beside the immutable actual', async () => {
    const api = await import('./outcome-actions');
    await at('2026-10-25T12:00:00Z');
    const id = await fixture();
    expect(await api.changeRequestOutcome(context(id, 1), measured)).toEqual({ error: 'Opens on 28 Oct 2026.' });
    expect(await api.readRequestOutcome(id, { orgId })).toMatchObject({ journey: { status: 'measuring' }, actions: { close: { allowed: false, reason: 'Opens on 28 Oct 2026.', opensOn: '2026-10-28' } } });
    await at('2026-10-28T00:00:00Z');
    const ctx = context(id, 1);
    const closed = await api.changeRequestOutcome(ctx, measured);
    expect(closed).toEqual({ success: true, revision: 2 });
    expect(await api.changeRequestOutcome(ctx, measured)).toEqual(closed);
    expect(await api.changeRequestOutcome(context(id, 2), measured)).toHaveProperty('error');
    const view = await api.readRequestOutcome(id, { orgId });
    expect(view).toMatchObject({
        state: 'closed',
        agreed: { form: 'numeric', baseline: 50, target: 80, unit: '%', guardrails: [{ metric: 'User error rate', operator: 'at_most', limit: 3 }] },
        closure: { kind: 'measured', actorId: 'outcome_owner', primary: { kind: 'numeric', actual: 62, unit: '%' }, guardrails: [{ actual: 2.5, held: true }], evidence: measured.evidence, observedFrom: '2026-10-21', observedTo: '2026-10-28', release: { exposureDate: '2026-10-21', dueDate: '2026-10-28' } },
    });
    const [row] = await connection `select status,priority,expected_impact from requests where id=${id}`;
    expect(row).toMatchObject({ status: 'done', priority: 'high', expected_impact: { primary: { target: 80 } } });
    await expect(connection `update requests set outcome_closure=jsonb_set(outcome_closure,'{primary,actual}','80') where id=${id}`).rejects.toThrow(/immutable/);
});
it('closes pass/fail and legacy commitments with negative or neutral results, but never without every agreed guardrail', async () => {
    const api = await import('./outcome-actions');
    await at('2026-11-30T00:00:00Z');
    const check = { ...conversion, primary: { key: 'check', name: '', unit: '', current: null, target: null, noBaseline: false, check: 'keyboard' }, guardrails: [] };
    const legacyMetric = { kind: 'metric', metric: 'Checkout completion', baseline: null, target: 80, unit: '%', source: 'Analytics', reviewAfterDays: 7, guardrail: { metric: 'Refunds', operator: 'less_than', limit: 5, unit: '%' } };
    const legacyVerification = { kind: 'verification', result: 'Keyboard checkout works', source: 'Checklist', reviewAfterDays: 14 };
    const failedCheck = await fixture({ impact: check });
    expect(await api.changeRequestOutcome(context(failedCheck, 1), measured)).toEqual({ error: 'Record whether the check passed.' });
    expect(await api.changeRequestOutcome(context(failedCheck, 1), { ...measured, primary: { kind: 'pass_fail', passed: false }, guardrails: [] })).toHaveProperty('success', true);
    const metric = await fixture({ impact: legacyMetric });
    expect(await api.readRequestOutcome(metric, { orgId })).toMatchObject({ agreed: { form: 'numeric', baseline: null, target: 80, guardrails: [{ metric: 'Refunds', operator: 'less_than', limit: 5 }] } });
    expect(await api.changeRequestOutcome(context(metric, 1), { ...measured, guardrails: [] })).toEqual({ error: 'Record an actual value for every agreed guardrail.' });
    // Below target and a breached guardrail is valid learning, not a closure gate.
    expect(await api.changeRequestOutcome(context(metric, 1), { ...measured, primary: { kind: 'numeric', actual: 40 }, guardrails: [9] })).toHaveProperty('success', true);
    expect(await api.readRequestOutcome(metric, { orgId })).toMatchObject({ closure: { primary: { actual: 40, unit: '%' }, guardrails: [{ actual: 9, held: false }] } });
    const verification = await fixture({ impact: legacyVerification });
    expect(await api.changeRequestOutcome(context(verification, 1), { ...measured, primary: { kind: 'pass_fail', passed: true }, guardrails: [] })).toHaveProperty('success', true);
    for (const invalid of [{ ...measured, evidence: ' ' }, { ...measured, observedFrom: '2026-10-29', observedTo: '2026-10-28' }, { ...measured, observedTo: '2026-12-01' }, { ...measured, primary: { kind: 'numeric', actual: Number.NaN } }, { ...measured, actorId: 'outcome_admin' }]) {
        const id = await fixture();
        expect(await api.changeRequestOutcome(context(id, 1), invalid)).toHaveProperty('error');
    }
    const unreleased = await fixture({ released: false });
    expect(await api.changeRequestOutcome(context(unreleased, 0), measured)).toEqual({ error: 'Opens once the release is recorded and the result is due.' });
});
it('closes without a result after pickup, never inventing one; before pickup the Request is deleted instead', async () => {
    const api = await import('./outcome-actions');
    const lifecycle = await import('./actions');
    await at('2026-10-22T00:00:00Z');
    const [open] = await connection `insert into requests(org_id,title,description,created_by,status) values (${orgId},'Not started','No agreement','outcome_owner','open') returning id`;
    expect(await api.changeRequestOutcome(context(open.id, 0), { kind: 'exception', reasonCode: 'cannot_measure', reason: '' })).toEqual({ error: 'Opens once the work is picked up.' });
    expect(await api.changeRequestOutcome(context(open.id, 0), { kind: 'exception', reasonCode: 'superseded', reason: 'Old reason' })).toHaveProperty('error');
    const unreleased = await fixture({ released: false });
    await connection `update requests set status='in_progress' where id=${unreleased}`;
    expect(await api.changeRequestOutcome(context(unreleased, 0), { kind: 'exception', reasonCode: 'other', reason: '' })).toEqual({ error: 'Say why this is closing without a result.' });
    expect(await api.changeRequestOutcome(context(unreleased, 0), { kind: 'exception', reasonCode: 'other', reason: 'Strategy changed mid-build' })).toEqual({ success: true, revision: 1 });
    expect(await lifecycle.markDone(unreleased, { orgId })).toEqual({ error: 'This Request is closed without a result and cannot advance.' });
    const [row] = await connection `select status,outcome_closure,exception_closure from requests where id=${unreleased}`;
    expect(row).toMatchObject({ status: 'in_progress', outcome_closure: null, exception_closure: { version: 1, reasonCode: 'other', release: null, actorId: 'outcome_owner' } });
    expect(await api.readRequestOutcome(unreleased, { orgId })).toMatchObject({ state: 'closed', closure: { kind: 'exception', reasonCode: 'other', reason: 'Strategy changed mid-build' } });
    const released = await fixture();
    expect(await api.changeRequestOutcome(context(released, 1), { kind: 'exception', reasonCode: 'rolled_back', reason: '' })).toHaveProperty('success', true);
    expect(await api.readRequestOutcome(released, { orgId })).toMatchObject({ closure: { reasonCode: 'rolled_back', release: { exposureDate: '2026-10-21' } } });
    const releaseApi = await import('./release-actions');
    expect(await releaseApi.changeRequestRelease(context(released, 2), { kind: 'void', reason: 'Undo closure', neverExposed: true })).toEqual({ error: 'This Request is closed.' });
    const unavailable = await fixture();
    expect(await api.changeRequestOutcome(context(unavailable, 1), { kind: 'exception', reasonCode: 'cannot_measure', reason: 'Analytics outage lost October data' })).toHaveProperty('success', true);
});
it('only the Requester closes; handover moves it, and admins, other members, guests, former Requesters and foreign workspaces cannot', async () => {
    const api = await import('./outcome-actions');
    const releaseApi = await import('./release-actions');
    await at('2026-10-28T00:00:00Z');
    const id = await fixture();
    session.userId = 'outcome_admin';
    session.orgRole = 'org:admin';
    expect(await api.changeRequestOutcome(context(id, 1), measured)).toEqual({ error: 'Only the Requester, outcome_owner, can close this.' });
    session.userId = 'outcome_pm';
    session.orgRole = 'org:member';
    expect(await api.changeRequestOutcome(context(id, 1), { kind: 'exception', reasonCode: 'cannot_measure', reason: 'PM disagrees' })).toEqual({ error: 'Only the Requester, outcome_owner, can close this.' });
    expect(await api.readRequestOutcome(id, { orgId })).toMatchObject({ requesterName: 'outcome_owner', actions: { close: { allowed: false, reason: 'Only the Requester, outcome_owner, can close this.' }, closeWithoutResult: { allowed: false, reason: 'Only the Requester, outcome_owner, can close this.' } } });
    session.userId = 'outcome_owner';
    session.orgRole = 'org:guest';
    expect(await api.changeRequestOutcome(context(id, 1), measured)).toHaveProperty('error');
    session.orgRole = 'org:member';
    session.orgId = 'org_outcome_foreign';
    expect(await api.changeRequestOutcome({ ...context(id, 1), orgId: session.orgId }, measured)).toHaveProperty('error');
    expect(await api.readRequestOutcome(id, { orgId: session.orgId })).toHaveProperty('error');
    session.orgId = orgId;
    roster.ids = everyone.filter(u => u !== 'outcome_owner');
    expect(await api.changeRequestOutcome(context(id, 1), measured)).toEqual({ error: 'Your workspace membership is no longer active.' });
    session.userId = 'outcome_admin';
    session.orgRole = 'org:admin';
    expect(await releaseApi.changeRequestRelease(context(id, 1), { kind: 'transfer', recipientId: 'outcome_next', reason: 'Owner left' })).toHaveProperty('success', true);
    roster.ids = [...everyone];
    session.userId = 'outcome_owner';
    session.orgRole = 'org:member';
    expect(await api.changeRequestOutcome(context(id, 2), measured)).toEqual({ error: 'Only the Requester, outcome_next, can close this.' });
    session.userId = 'outcome_next';
    expect(await api.readRequestOutcome(id, { orgId })).toMatchObject({ requesterId: 'outcome_next', actions: { close: { allowed: true }, closeWithoutResult: { allowed: true }, correctClosure: { allowed: false } } });
    expect(await api.changeRequestOutcome(context(id, 2), measured)).toEqual({ success: true, revision: 3 });
    const [row] = await connection `select created_by,outcome_closure from requests where id=${id}`;
    expect(row).toMatchObject({ created_by: 'outcome_owner', outcome_closure: { actorId: 'outcome_next', ownerId: 'outcome_next' } });
});
it('serializes ownership transfer against closure: a stale owner never closes after losing authority', async () => {
    const api = await import('./outcome-actions');
    const releaseApi = await import('./release-actions');
    await at('2026-10-28T00:00:00Z');
    const id = await fixture();
    roster.ids = everyone.filter(u => u !== 'outcome_owner');
    session.userId = 'outcome_admin';
    session.orgRole = 'org:admin';
    const transfer = releaseApi.changeRequestRelease(context(id, 1), { kind: 'transfer', recipientId: 'outcome_next', reason: 'Owner left' });
    session.userId = 'outcome_next';
    session.orgRole = 'org:member';
    const close = api.changeRequestOutcome(context(id, 1), measured);
    const [transferred, closed] = await Promise.all([transfer, close]);
    expect(transferred).toHaveProperty('success', true);
    // The recipient's closure either ran before the transfer (not owner) or after it (stale revision); never both authorities.
    expect(closed).toHaveProperty('error');
    expect(await api.changeRequestOutcome(context(id, 2), measured)).toHaveProperty('success', true);
    expect(await api.readRequestOutcome(id, { orgId })).toMatchObject({ closure: { actorId: 'outcome_next' } });
});
it('lets the admin transfer a closed Request after the owner leaves, so the new owner can correct it, but never reopens it', async () => {
    const api = await import('./outcome-actions');
    const releaseApi = await import('./release-actions');
    await at('2026-10-28T00:00:00Z');
    const id = await fixture();
    await api.changeRequestOutcome(context(id, 1), measured);
    roster.ids = everyone.filter(u => u !== 'outcome_owner');
    session.userId = 'outcome_admin';
    session.orgRole = 'org:admin';
    expect(await releaseApi.readRequestRelease(id, { orgId })).toMatchObject({ actions: { handover: { allowed: true }, correctRelease: { allowed: false } } });
    expect(await releaseApi.changeRequestRelease(context(id, 2), { kind: 'transfer', recipientId: 'outcome_next', reason: 'Owner left after closing' })).toEqual({ success: true, revision: 3 });
    expect(await releaseApi.changeRequestRelease(context(id, 3), { kind: 'release', exposureDate: '2026-10-22', evidence: 'x', audienceConfirmed: true })).toHaveProperty('error');
    session.userId = 'outcome_next';
    session.orgRole = 'org:member';
    expect(await releaseApi.readRequestRelease(id, { orgId })).toMatchObject({ actions: { correctRelease: { allowed: false }, release: { allowed: false } } });
    expect(await api.readRequestOutcome(id, { orgId })).toMatchObject({ actions: { correctClosure: { allowed: true }, close: { allowed: false } } });
});
it('appends attributable corrections beside the immutable closure, with lost-response retry and no rewriting', async () => {
    const api = await import('./outcome-actions');
    await at('2026-10-28T00:00:00Z');
    const id = await fixture();
    const fix = { kind: 'correction', field: 'evidence', correction: 'The export covered 21–27 October', reason: 'Dashboard date range was mislabelled' };
    expect(await api.changeRequestOutcome(context(id, 1), fix)).toEqual({ error: 'Corrections open once the Request is closed.' });
    await api.changeRequestOutcome(context(id, 1), measured);
    for (const invalid of [{ ...fix, reason: '' }, { ...fix, field: 'target' }, { ...fix, correction: ' ' }])
        expect(await api.changeRequestOutcome(context(id, 2), invalid)).toHaveProperty('error');
    session.userId = 'outcome_pm';
    expect(await api.changeRequestOutcome(context(id, 2), fix)).toEqual({ error: 'Only the Requester, outcome_owner, can add a correction.' });
    expect(await api.readRequestOutcome(id, { orgId })).toMatchObject({ actions: { correctClosure: { allowed: false, reason: 'Only the Requester, outcome_owner, can add a correction.' } } });
    session.userId = 'outcome_owner';
    const ctx = context(id, 2);
    const results = await Promise.all([api.changeRequestOutcome(ctx, fix), api.changeRequestOutcome(ctx, fix)]);
    expect(results).toEqual([{ success: true, revision: 3 }, { success: true, revision: 3 }]);
    expect(await api.changeRequestOutcome(ctx, { ...fix, correction: 'Different' })).toEqual({ error: 'This retry key was used for another change.' });
    expect(await api.changeRequestOutcome(context(id, 2), fix)).toEqual({ error: 'Request changed. Reload before trying again.' });
    expect(await api.changeRequestOutcome(context(id, 3), { ...fix, field: 'reason' })).toEqual({ error: 'Choose a part of this closure to correct.' });
    expect(await api.changeRequestOutcome(context(id, 3), { ...fix, field: 'actual', correction: 'Actual was 61%', reason: 'Rounding' })).toEqual({ success: true, revision: 4 });
    const view = await api.readRequestOutcome(id, { orgId });
    expect(view).toMatchObject({ closure: { evidence: measured.evidence, primary: { actual: 62 } }, corrections: [{ field: 'evidence', actorId: 'outcome_owner', reason: fix.reason }, { field: 'actual', correction: 'Actual was 61%' }] });
    const exceptional = await fixture();
    await api.changeRequestOutcome(context(exceptional, 1), { kind: 'exception', reasonCode: 'cannot_measure', reason: 'Too few sessions' });
    expect(await api.changeRequestOutcome(context(exceptional, 2), { ...fix, field: 'actual', correction: 'Invented 61%' })).toEqual({ error: 'Choose a part of this closure to correct.' });
    expect(await api.changeRequestOutcome(context(exceptional, 2), { ...fix, field: 'reason', correction: 'Holiday traffic, not too few sessions' })).toHaveProperty('success', true);
    expect(await api.readRequestOutcome(exceptional, { orgId })).toMatchObject({ closure: { reason: 'Too few sessions' }, corrections: [{ field: 'reason' }] });
});
it('creates linked follow-ups after release with copied context and unanswered reviewers, leaving the original obligation intact', async () => {
    const api = await import('./outcome-actions');
    await at('2026-10-24T00:00:00Z');
    const unreleased = await fixture({ released: false });
    expect(await api.createFollowUpRequest(context(unreleased, 0), { reason: 'Too early' })).toEqual({ error: 'Opens once the work is released.' });
    const id = await fixture();
    const review = (userId: string, decision: object) => ({ id: randomUUID(), nominee: { kind: 'member', userId }, displayNameAtSelection: userId, addedBy: 'outcome_owner', note: 'Can we build this?', decision: { actorId: userId, at: '2026-10-20T00:00:00.000Z', ...decision } });
    await connection `insert into request_agreements(request_id,org_id,reviewers) values (${id},${orgId},${connection.json([review('outcome_designer', { kind: 'looks_good', reason: '' }), review('outcome_developer', { kind: 'concern', reason: 'API not ready' })])})`;
    const [before] = await connection `select release_state,agreement_revision,outcome_closure,exception_closure,updated_at from requests where id=${id}`;
    session.orgRole = 'org:guest';
    expect(await api.createFollowUpRequest(context(id, 1), { reason: 'Guest' })).toHaveProperty('error');
    session.orgRole = 'org:member';
    session.userId = 'outcome_designer';
    expect(await api.createFollowUpRequest(context(id, 1), { reason: '' })).toHaveProperty('error');
    const ctx = context(id, 1);
    const results = await Promise.all([api.createFollowUpRequest(ctx, { reason: 'Mobile checkout needs the same fix' }), api.createFollowUpRequest(ctx, { reason: 'Mobile checkout needs the same fix' })]);
    expect(results[0]).toMatchObject({ success: true });
    expect(results[1]).toEqual(results[0]);
    if (!('followUpId' in results[0])) throw Error('missing follow-up');
    const followUpId = results[0].followUpId;
    // A second, different follow-up is allowed; the original keeps every saved fact.
    expect(await api.createFollowUpRequest(context(id, 1), { reason: 'Refund flow found in measurement' })).toHaveProperty('success', true);
    const [after] = await connection `select release_state,agreement_revision,outcome_closure,exception_closure,updated_at from requests where id=${id}`;
    expect(after).toEqual(before);
    const [follow] = await connection `select r.title,r.created_by,r.status,r.follow_up_of,r.expected_impact,a.reviewers from requests r join request_agreements a on a.request_id=r.id where r.id=${followUpId}`;
    expect(follow).toMatchObject({ title: 'Checkout problem', created_by: 'outcome_designer', status: 'open', follow_up_of: id, expected_impact: { primary: { target: 80 } } });
    // The follow-up's creator is left out; everyone else is asked again, with no answer carried over.
    expect(follow.reviewers).toEqual([{ id: expect.any(String), nominee: { kind: 'member', userId: 'outcome_developer' }, displayNameAtSelection: 'outcome_developer', addedBy: 'outcome_designer', note: '', decision: null }]);
    // Each carried-over reviewer is asked to review the follow-up, once despite the duplicate submit; the creator is not told about their own action.
    expect(await connection `select user_id,type::text,actor_id,detail from notifications where request_id=${followUpId}`).toEqual([{ user_id: 'outcome_developer', type: 'review_requested', actor_id: 'outcome_designer', detail: null }]);
    expect(await api.readRequestOutcome(id, { orgId })).toMatchObject({ state: 'measuring', followUps: [{ reason: 'Mobile checkout needs the same fix', createdBy: 'outcome_designer' }, { reason: 'Refund flow found in measurement' }] });
    expect(await api.readRequestOutcome(followUpId, { orgId })).toMatchObject({ followUpOf: { id, title: 'Checkout problem' }, state: 'not_started' });
    // Closed originals take follow-ups too, without reopening.
    await at('2026-10-28T00:00:00Z');
    session.userId = 'outcome_owner';
    await api.changeRequestOutcome(context(id, 1), measured);
    session.userId = 'outcome_pm';
    expect(await api.createFollowUpRequest(context(id, 2), { reason: 'Next iteration' })).toHaveProperty('success', true);
    expect(await api.readRequestOutcome(id, { orgId })).toMatchObject({ state: 'closed' });
});
it('duplicate closure submissions from one tab or two produce exactly one durable result', async () => {
    const api = await import('./outcome-actions');
    await at('2026-10-28T00:00:00Z');
    const id = await fixture();
    const ctx = context(id, 1);
    expect(await Promise.all([api.changeRequestOutcome(ctx, measured), api.changeRequestOutcome(ctx, measured)])).toEqual([{ success: true, revision: 2 }, { success: true, revision: 2 }]);
    const other = await fixture();
    const raced = await Promise.all([api.changeRequestOutcome(context(other, 1), measured), api.changeRequestOutcome(context(other, 1), { kind: 'exception', reasonCode: 'cannot_measure', reason: 'Second tab' })]);
    expect(raced.filter(r => 'success' in r)).toHaveLength(1);
    const [row] = await connection `select (outcome_closure is null)::int + (exception_closure is null)::int as open_slots from requests where id=${other}`;
    expect(row.open_slots).toBe(1);
});
it('an owner whose closure locks first keeps it; the concurrent admin transfer is rejected as stale', async () => {
    // The transfer-first ordering is covered above: the former owner then loses closure authority.
    const api = await import('./outcome-actions');
    const releaseApi = await import('./release-actions');
    await at('2026-10-28T00:00:00Z');
    const id = await fixture();
    // The owner's Clerk check passes just before access is revoked; Clerk and Postgres cannot share a transaction.
    const close = api.changeRequestOutcome(context(id, 1), { kind: 'exception', reasonCode: 'cannot_measure', reason: 'Owner closing' });
    roster.ids = everyone.filter(u => u !== 'outcome_owner');
    session.userId = 'outcome_admin';
    session.orgRole = 'org:admin';
    const transfer = releaseApi.changeRequestRelease(context(id, 1), { kind: 'transfer', recipientId: 'outcome_next', reason: 'Owner left' });
    const [closed, transferred] = await Promise.all([close, transfer]);
    expect([closed, transferred].filter(r => 'success' in r)).toHaveLength(1);
    const [row] = await connection `select exception_closure,release_state from requests where id=${id}`;
    if ('success' in closed) expect(row).toMatchObject({ exception_closure: { actorId: 'outcome_owner', ownerId: 'outcome_owner' }, release_state: { ownerId: 'outcome_owner' } });
    else expect(row).toMatchObject({ exception_closure: null, release_state: { ownerId: 'outcome_next' } });
});
it('#209: records an optional one-line What we learned with either closure, and changes it only by a Correction', async () => {
    const api = await import('./outcome-actions');
    await at('2026-10-28T00:00:00Z');
    const id = await fixture();
    for (const learned of ['two\nlines', 'x'.repeat(281)])
        expect(await api.changeRequestOutcome(context(id, 1), { ...measured, learned })).toHaveProperty('error');
    expect(await api.changeRequestOutcome(context(id, 1), { ...measured, learned: '  Shoppers trust the shorter form  ' })).toEqual({ success: true, revision: 2 });
    expect(await api.readRequestOutcome(id, { orgId })).toMatchObject({ closure: { kind: 'measured', learned: 'Shoppers trust the shorter form' } });
    // Left blank, nothing is stored.
    const blank = await fixture();
    expect(await api.changeRequestOutcome(context(blank, 1), { ...measured, learned: '   ' })).toHaveProperty('success', true);
    const [blankRow] = await connection `select outcome_closure ? 'learned' as has_learned from requests where id=${blank}`;
    expect(blankRow.has_learned).toBe(false);
    const rolledBack = await fixture();
    expect(await api.changeRequestOutcome(context(rolledBack, 1), { kind: 'exception', reasonCode: 'rolled_back', reason: '', learned: 'Test on Safari first' })).toHaveProperty('success', true);
    expect(await api.readRequestOutcome(rolledBack, { orgId })).toMatchObject({ closure: { kind: 'exception', learned: 'Test on Safari first' } });
    // Only the Requester corrects it, one line at a time, and the original stays.
    const fix = { kind: 'correction', field: 'learned', correction: 'Shoppers trust a form with fewer fields', reason: 'Clearer wording' };
    session.userId = 'outcome_pm';
    expect(await api.changeRequestOutcome(context(id, 2), fix)).toEqual({ error: 'Only the Requester, outcome_owner, can add a correction.' });
    session.userId = 'outcome_owner';
    expect(await api.changeRequestOutcome(context(id, 2), { ...fix, correction: 'two\nlines' })).toHaveProperty('error');
    expect(await api.changeRequestOutcome(context(id, 2), fix)).toEqual({ success: true, revision: 3 });
    expect(await api.readRequestOutcome(id, { orgId })).toMatchObject({ closure: { learned: 'Shoppers trust the shorter form' }, corrections: [{ field: 'learned', correction: fix.correction, actorId: 'outcome_owner' }] });
    // A Correction can add the line to a closure saved without one, and closures without a result take it too.
    expect(await api.changeRequestOutcome(context(blank, 2), { ...fix, correction: 'Added later' })).toHaveProperty('success', true);
    expect(await api.changeRequestOutcome(context(rolledBack, 2), { ...fix, correction: 'Test on every browser first' })).toHaveProperty('success', true);
});
