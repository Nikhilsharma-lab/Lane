import { callAction } from "@/lib/action-call";
import { addMembers, removeMember, setMembers } from "@/test/member-fixtures";
import { requireTestDatabase } from "@/test/test-database";
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, afterEach, expect, it, vi } from 'vitest';
import type { Session } from "@/lib/session";
const session = vi.hoisted((): Session => ({ userId: 'release_owner', orgId: 'org_release', role: 'member' }));
const roles = { release_owner: 'member', release_pm: 'member', release_designer: 'member', release_developer: 'member', release_admin: 'admin', release_next: 'member' };
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
// A blank userId is a signed-out visitor.
vi.mock('@/lib/session', () => ({ readSession: async () => (session.userId ? { ...session } : null) }));
const connection = postgres(requireTestDatabase(process.env.DATABASE_URL).url, { max: 6, prepare: false });
const orgId = 'org_release';
beforeAll(async () => {
    await connection `insert into organizations(id,name,slug) values (${orgId},'Release tests','release-tests')`;
    for (const id of Object.keys(roles))
        await connection `insert into profiles(id,full_name,email) values (${id},${id},${id + '@example.test'})`;
    await setMembers(orgId, roles);
});
afterAll(() => connection.end());
afterEach(async () => { vi.useRealTimers(); session.userId = 'release_owner'; session.orgId = orgId; session.role = 'member'; await setMembers(orgId, roles); });
const context = (requestId: string, expectedRevision = 0) => ({ orgId, requestId, expectedRevision, operationId: randomUUID() });
const release = { kind: 'release', exposureDate: '2026-10-21', evidence: 'Full audience rollout confirmed in release log', audienceConfirmed: true, valueBeforeRelease: { value: 50, unit: '%' } };
async function fixture(fixed = false) {
    const [row] = await connection `insert into requests(org_id,title,description,affected_people,created_by,status,priority,created_at) values (${orgId},'Checkout problem','Unable to pay','All shoppers','release_owner','done','high','2026-10-01T00:00:00Z') returning *`;
    const impact = { kind: 'measurement', version: 2, primary: { key: 'conversion', name: '', unit: 'percent', current: 50, target: 80, noBaseline: false, check: '' }, measurement: { audience: 'all', platform: 'all', windowDays: 7, exactDates: fixed, startDate: fixed ? '2026-10-01' : '', endDate: fixed ? '2026-10-15' : '' }, guardrails: [] };
    await connection `update requests set expected_impact=${connection.json(impact)} where id=${row.id}`;
    return row.id as string;
}
it('records past exposure once and derives UTC measurement deadline from exposure rather than recording time', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-25T12:00:00Z'));
    const api = await import('./release-actions');
    const id = await fixture();
    const ctx = context(id);
    const saved = await api.changeRequestRelease(ctx, release);
    expect(saved).toEqual({ success: true, revision: 1 });
    expect(await api.changeRequestRelease(ctx, release)).toEqual(saved);
    const view = await api.readRequestRelease(id, { orgId });
    // #278: the release saves the agreed goal's audience in the plan's own words, not the Request's "Users" field.
    expect(view).toMatchObject({ release: { exposureDate: '2026-10-21', audience: 'All users', dueDate: '2026-10-28', windowKind: 'relative' }, measurement: { label: 'Due in 3 days', due: false }, requesterId: 'release_owner' });
    const [row] = await connection `select status,priority,release_state from requests where id=${id}`;
    expect(row.status).toBe('done');
    expect(row.priority).toBe('high');
    expect(row.release_state.history).toHaveLength(1);
});
it('uses the exact UTC deadline boundary and never auto-closes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-27T23:59:59.999Z'));
    const api = await import('./release-actions');
    const id = await fixture();
    await api.changeRequestRelease(context(id), release);
    expect(await api.readRequestRelease(id, { orgId })).toMatchObject({ measurement: { due: false, label: 'Due in 1 day' } });
    vi.setSystemTime(new Date('2026-10-28T00:00:00Z'));
    expect(await api.readRequestRelease(id, { orgId })).toMatchObject({ measurement: { due: true, label: 'Due today' } });
    vi.setSystemTime(new Date('2026-10-29T00:00:00Z'));
    expect(await api.readRequestRelease(id, { orgId })).toMatchObject({ measurement: { due: true, label: 'Overdue 1 day' } });
    const [row] = await connection `select status,exception_closure from requests where id=${id}`;
    expect(row).toMatchObject({ status: 'done', exception_closure: null });
});
it('keeps fixed dates unchanged after late release and reasoned correction; void retains every fact', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-30T00:00:00Z'));
    const api = await import('./release-actions');
    const id = await fixture(true);
    expect(await api.changeRequestRelease(context(id), release)).toHaveProperty('success', true);
    expect(await api.changeRequestRelease(context(id, 1), { ...release, kind: 'correct', exposureDate: '2026-10-22', reason: 'Release log had the wrong date' })).toHaveProperty('success', true);
    expect(await api.readRequestRelease(id, { orgId })).toMatchObject({ release: { startDate: '2026-10-01', dueDate: '2026-10-15', windowKind: 'fixed' } });
    expect(await api.changeRequestRelease(context(id, 2), { kind: 'void', reason: 'Only staging was exposed', neverExposed: true })).toHaveProperty('success', true);
    const view = await api.readRequestRelease(id, { orgId });
    expect(view).toMatchObject({ release: null, measurement: null });
    if ('error' in view)
        throw Error(view.error);
    expect(view.history).toHaveLength(3);
    expect(view.history[0].release?.exposureDate).toBe('2026-10-21');
    await expect(connection `update requests set release_state=null where id=${id}`).rejects.toThrow(/immutable/);
});
it('corrects relative exposure, requires reasons and explicit agreed-audience confirmation, and rejects future/invalid dates', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-25T00:00:00Z'));
    const api = await import('./release-actions');
    const id = await fixture();
    for (const invalid of [{ ...release, audienceConfirmed: false }, { ...release, exposureDate: '2026-02-30' }, { ...release, exposureDate: '2026-10-27' }, { ...release, evidence: '' }, { ...release, actorId: 'release_admin' }])
        expect(await api.changeRequestRelease(context(id), invalid)).toHaveProperty('error');
    await api.changeRequestRelease(context(id), release);
    expect(await api.changeRequestRelease(context(id, 1), { ...release, kind: 'correct', reason: '' })).toHaveProperty('error');
    expect(await api.changeRequestRelease(context(id, 1), { ...release, kind: 'correct', exposureDate: '2026-10-20', reason: 'Verified original exposure log' })).toHaveProperty('success', true);
    expect(await api.readRequestRelease(id, { orgId })).toMatchObject({ release: { dueDate: '2026-10-27' } });
});
// #309: a Request whose Goal is No measurable impact has no measurement window, so nothing is released or corrected.
it('refuses to record or correct a release for a Request with no measurable impact, saving nothing', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-25T12:00:00Z'));
    const api = await import('./release-actions');
    const [row] = await connection `insert into requests(org_id,title,description,affected_people,created_by,status,priority,created_at,no_measurable_impact_reason) values (${orgId},'Rename tokens','Token rename','Engineers','release_owner','done','high','2026-10-01T00:00:00Z','Token rename with no user-facing change') returning id`;
    const refusal = { error: 'This Request has no measurable impact, so there’s no release to record.' };
    expect(await api.changeRequestRelease(context(row.id), release)).toEqual(refusal);
    expect(await api.changeRequestRelease(context(row.id), { ...release, valueBeforeRelease: undefined })).toEqual(refusal);
    expect(await api.changeRequestRelease(context(row.id), { ...release, kind: 'correct', reason: 'Release log had the wrong date' })).toEqual(refusal);
    const [after] = await connection `select status,release_state,agreement_revision,exception_closure from requests where id=${row.id}`;
    expect(after).toEqual({ status: 'done', release_state: null, agreement_revision: 0, exception_closure: null });
    // Everyone sees the same reason the server gives.
    expect(await api.readRequestRelease(row.id, { orgId })).toMatchObject({ noMeasurableImpactReason: 'Token rename with no user-facing change', actions: { release: { allowed: false, reason: refusal.error }, correctRelease: { allowed: false, reason: refusal.error }, closeWithoutResult: { allowed: true } } });
});
// #309: a released Request keeps its measured Goal: only an Open Request can be edited, so its Goal can't become No
// measurable impact after the release.
it('refuses to switch a released Request\'s Goal to No measurable impact', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-25T12:00:00Z'));
    const api = await import('./release-actions');
    const { saveRequestEdits } = await import('./edit-actions');
    const { requestEditSnapshot } = await import('@/lib/request-edit');
    const { db, requests } = await import('@/db');
    const { eq } = await import('drizzle-orm');
    const id = await fixture();
    expect(await api.changeRequestRelease(context(id), release)).toEqual({ success: true, revision: 1 });
    const [saved] = await db.select().from(requests).where(eq(requests.id, id));
    const changes = { title: saved.title, description: saved.description, affectedPeople: saved.affectedPeople ?? '', desiredChange: '', observedEvidence: '', uncertainty: '', usefulLink: '',
        projectId: null, requestType: null, priority: 'high', reframedProblem: null, extractedSolution: null, expectedImpact: { kind: 'no_measurable_impact', reason: 'Nothing to measure after all' } };
    expect(await saveRequestEdits(id, { snapshot: requestEditSnapshot(saved as never), changes }, { orgId })).toEqual({ error: 'Only Open Requests can be edited. This Request has already been picked up.' });
    const [row] = await connection `select expected_impact is not null as measured, no_measurable_impact_reason, release_state->'release'->>'exposureDate' as released from requests where id=${id}`;
    expect(row).toEqual({ measured: true, no_measurable_impact_reason: null, released: '2026-10-21' });
});
it('blocks wrong lifecycle, guests and foreign workspace reads/writes', async () => {
    const api = await import('./release-actions');
    const id = await fixture();
    session.role = 'guest';
    expect(await api.readRequestRelease(id, { orgId })).toHaveProperty('release', null);
    expect(await api.changeRequestRelease(context(id), release)).toHaveProperty('error');
    session.userId = 'release_next';
    expect(await api.readRequestRelease(id, { orgId })).toHaveProperty('error');
    session.role = 'member';
    session.orgId = 'org_foreign';
    expect(await api.readRequestRelease(id, { orgId: session.orgId })).toHaveProperty('error');
    expect(await api.changeRequestRelease({ ...context(id), orgId: session.orgId }, release)).toHaveProperty('error');
    session.orgId = orgId;
    session.userId = 'release_owner';
    await connection `update requests set status='in_progress' where id=${id}`;
    expect(await api.changeRequestRelease(context(id), release)).toEqual({ error: 'Opens once the work is Done.' });
});
it('hands over only from a departed Requester to an active member, retains authorship and permits repeat transfers and lost-response retry', async () => {
    const api = await import('./release-actions');
    const id = await fixture();
    session.userId = 'release_admin';
    session.role = 'admin';
    const transfer = { kind: 'transfer', recipientId: 'release_next', reason: 'Original owner left the workspace' };
    expect(await api.changeRequestRelease(context(id), transfer)).toHaveProperty('error');
    await removeMember(orgId, 'release_owner');
    expect(await api.changeRequestRelease(context(id), { ...transfer, recipientId: 'unknown' })).toHaveProperty('error');
    const ctx = context(id);
    const result = await api.changeRequestRelease(ctx, transfer);
    expect(result).toEqual({ success: true, revision: 1 });
    expect(await api.changeRequestRelease(ctx, transfer)).toEqual(result);
    session.userId = 'release_next';
    session.role = 'member';
    expect(await api.changeRequestRelease(context(id, 1), release)).toHaveProperty('success', true);
    const [row] = await connection `select created_by,release_state from requests where id=${id}`;
    expect(row.created_by).toBe('release_owner');
    expect(row.release_state.ownerId).toBe('release_next');
    expect(row.release_state.history[0]).toMatchObject({ actorId: 'release_admin', previousOwnerId: 'release_owner', ownerId: 'release_next' });
    session.userId = 'release_owner';
    expect(await api.changeRequestRelease(context(id, 2), { kind: 'void', reason: 'Stale owner', neverExposed: true })).toHaveProperty('error');
    await removeMember(orgId, 'release_next');
    session.userId = 'release_admin';
    session.role = 'admin';
    expect(await api.changeRequestRelease(context(id, 2), { ...transfer, recipientId: 'release_admin' })).toHaveProperty('success', true);
});
it('names a departed owner and every history actor from saved profiles, for guests too', async () => {
    const api = await import('./release-actions');
    const id = await fixture();
    await connection `update profiles set full_name='Maya Chen' where id='release_owner'`;
    await connection `update profiles set full_name='Ana Admin' where id='release_admin'`;
    try {
        await api.changeRequestRelease(context(id), release);
        await removeMember(orgId, 'release_owner');
        session.userId = 'release_admin';
        session.role = 'admin';
        const departed = await api.readRequestRelease(id, { orgId });
        expect(departed).toMatchObject({ requesterName: 'Maya Chen', names: { release_owner: 'Maya Chen' } });
        await api.changeRequestRelease(context(id, 1), { kind: 'transfer', recipientId: 'release_next', reason: 'Owner left' });
        session.userId = 'release_owner';
        session.role = 'guest';
        const guest = await api.readRequestRelease(id, { orgId });
        expect(guest).toMatchObject({ requesterName: 'release_next', names: { release_owner: 'Maya Chen', release_admin: 'Ana Admin', release_next: 'release_next' } });
    }
    finally {
        await connection `update profiles set full_name=id where id in ('release_owner','release_admin')`;
    }
});
it('lets the Requester correct and void a release after another member departs', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-25T00:00:00Z'));
    const api = await import('./release-actions');
    const id = await fixture();
    await api.changeRequestRelease(context(id), release);
    await removeMember(orgId, 'release_designer');
    expect(await api.readRequestRelease(id, { orgId })).toMatchObject({ actions: { correctRelease: { allowed: true } } });
    expect(await api.changeRequestRelease(context(id, 1), { ...release, kind: 'correct', exposureDate: '2026-10-20', reason: 'Verified original exposure log' })).toHaveProperty('success', true);
    expect(await api.readRequestRelease(id, { orgId })).toMatchObject({ release: { exposureDate: '2026-10-20', dueDate: '2026-10-27', audience: 'All users' } });
    expect(await api.changeRequestRelease(context(id, 2), { kind: 'void', reason: 'Only staging was exposed', neverExposed: true })).toHaveProperty('success', true);
});
// #277 (#235 item 8): the earliest release date is the pickup day. Pickup and release are UTC days while the picker
// offers the viewer's own days, so the server allows one day either side: UTC pickup day minus one to UTC today plus one.
it('accepts a release date from the day before the UTC pickup day, and refuses earlier ones with the pickup day', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-25T00:00:00Z'));
    const api = await import('./release-actions');
    const id = await fixture();
    // Filed on 1 October, picked up late on 20 October UTC: still 20 October in London, already 21 October in Kolkata.
    await connection `update requests set picked_up_at='2026-10-20T23:30:00Z' where id=${id}`;
    expect(await api.readRequestRelease(id, { orgId })).toMatchObject({ earliestRelease: '2026-10-20T23:30:00.000Z' });
    expect(await api.changeRequestRelease(context(id), { ...release, exposureDate: '2026-10-18' })).toEqual({ error: 'The release date can’t be before the work was picked up on 20 Oct.' });
    expect(await api.changeRequestRelease(context(id), { ...release, exposureDate: '2026-10-19' })).toHaveProperty('success', true);
    expect(await api.changeRequestRelease(context(id, 1), { ...release, kind: 'correct', exposureDate: '2026-10-18', reason: 'Wrong log' })).toEqual({ error: 'The release date can’t be before the work was picked up on 20 Oct.' });
});
it('falls back to the filed day for a Request with no recorded pickup time, with the same one-day tolerance', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-25T00:00:00Z'));
    const api = await import('./release-actions');
    const id = await fixture();
    // Older work has no pickup time. Filed late on 20 October UTC; reviews play no part.
    await connection `update requests set created_at='2026-10-20T23:30:00Z' where id=${id}`;
    expect(await api.readRequestRelease(id, { orgId })).toMatchObject({ pickedUpAt: null, earliestRelease: '2026-10-20T23:30:00.000Z' });
    expect(await api.changeRequestRelease(context(id), { ...release, exposureDate: '2026-10-18' })).toEqual({ error: 'The release date can’t be before the Request was filed on 20 Oct.' });
    expect(await api.changeRequestRelease(context(id), { ...release, exposureDate: '2026-10-19' })).toHaveProperty('success', true);
});
it('accepts the day after UTC today, for a viewer east of UTC, and refuses any later day', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 22:00 UTC on 24 October is already 25 October east of UTC.
    vi.setSystemTime(new Date('2026-10-24T22:00:00Z'));
    const api = await import('./release-actions');
    const id = await fixture();
    expect(await api.changeRequestRelease(context(id), { ...release, exposureDate: '2026-10-26' })).toEqual({ error: 'The release date can’t be in the future.' });
    expect(await api.changeRequestRelease(context(id), { ...release, exposureDate: '2026-10-25' })).toHaveProperty('success', true);
});
it('lets a correction keep a saved release date from before the pickup-day rule', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-25T00:00:00Z'));
    const api = await import('./release-actions');
    const id = await fixture();
    // Recorded under the filed-day rule, before the pickup time was known.
    await api.changeRequestRelease(context(id), { ...release, exposureDate: '2026-10-05' });
    await connection `update requests set picked_up_at='2026-10-20T10:00:00Z' where id=${id}`;
    expect(await api.changeRequestRelease(context(id, 1), { ...release, kind: 'correct', exposureDate: '2026-10-05', evidence: 'Corrected evidence link', reason: 'Wrong log' })).toHaveProperty('success', true);
    expect(await api.changeRequestRelease(context(id, 2), { ...release, kind: 'correct', exposureDate: '2026-10-04', reason: 'Wrong log' })).toEqual({ error: 'The release date can’t be before the work was picked up on 20 Oct.' });
});
it('records release with no reviewers and with an open concern', async () => {
    const api = await import('./release-actions');
    const reviewed = await fixture();
    await connection `insert into request_agreements(request_id,org_id,reviewers) values (${reviewed},${orgId},${connection.json([{ id: randomUUID(), nominee: { kind: 'member', userId: 'release_developer' }, displayNameAtSelection: 'Developer', addedBy: 'release_owner', note: '', decision: { kind: 'concern', actorId: 'release_developer', at: '2026-10-20T00:00:00.000Z', reason: 'API not ready' } }])})`;
    expect(await api.changeRequestRelease(context(reviewed), release)).toHaveProperty('success', true);
    expect(await api.changeRequestRelease(context(await fixture()), release)).toHaveProperty('success', true);
});
it('serializes concurrent duplicate release and rejects reuse of its operation key for different facts', async () => {
    const api = await import('./release-actions');
    const id = await fixture();
    const ctx = context(id);
    const results = await Promise.all([api.changeRequestRelease(ctx, release), api.changeRequestRelease(ctx, release)]);
    expect(results).toEqual([{ success: true, revision: 1 }, { success: true, revision: 1 }]);
    expect(await api.changeRequestRelease(ctx, { ...release, evidence: 'Different evidence' })).toHaveProperty('error');
    expect(await api.changeRequestRelease(context(id, 1), release)).toHaveProperty('error');
});
it('release locks out Done undo', async () => {
    const api = await import('./release-actions');
    const id = await fixture();
    await api.changeRequestRelease(context(id), release);
    expect(await (await import('./actions')).undoMarkDone(id, { orgId })).toHaveProperty('error');
});
it('preserves fixed-date additions on legacy metric and verification commitments', async () => {
    const api = await import('./release-actions');
    for (const kind of ['metric', 'verification']) {
        const id = await fixture();
        const impact = kind === 'metric' ? { kind, metric: 'Checkout', baseline: 50, target: 80, unit: '%', source: 'Analytics', reviewAfterDays: 7 } : { kind, result: 'Keyboard checkout works', source: 'Checklist', reviewAfterDays: 14 };
        const measurement = { audience: 'all', platform: 'web', exactDates: true, startDate: '2026-10-01', endDate: '2026-10-15' };
        await connection `update requests set expected_impact=${connection.json({ ...impact, measurement })} where id=${id}`;
        expect(await api.changeRequestRelease(context(id), release)).toHaveProperty('success', true);
        expect(await api.readRequestRelease(id, { orgId })).toMatchObject({ release: { windowKind: 'fixed', dueDate: '2026-10-15' } });
    }
});
it('a departed owner cannot win a transfer/release race or replay an old release after transfer', async () => {
    const api = await import('./release-actions');
    const id = await fixture();
    const first = context(id);
    await api.changeRequestRelease(first, release);
    await removeMember(orgId, 'release_owner');
    // readSession() captures the session synchronously, so each call below runs as the user set before it.
    const staleRelease = api.changeRequestRelease(first, release);
    const staleCorrection = api.changeRequestRelease(context(id, 1), { ...release, kind: 'correct', exposureDate: '2026-10-01', reason: 'Stale tab' });
    session.userId = 'release_admin';
    session.role = 'admin';
    const transfer = api.changeRequestRelease(context(id, 1), { kind: 'transfer', recipientId: 'release_next', reason: 'Original owner departed' });
    const results = await Promise.all([staleRelease, staleCorrection, transfer]);
    expect(results[0]).toHaveProperty('error');
    expect(results[1]).toHaveProperty('error');
    expect(results[2]).toEqual({ success: true, revision: 2 });
    // With access restored, the former Requester corrects like any member, against the current revision only.
    await addMembers(orgId, { release_owner: 'member' });
    session.userId = 'release_owner';
    session.role = 'member';
    expect(await api.changeRequestRelease(context(id, 1), { ...release, kind: 'correct', exposureDate: '2026-10-01', reason: 'Stale tab' })).toEqual({ error: 'Request changed. Reload before trying again.' });
    const view = await api.readRequestRelease(id, { orgId });
    expect(view).toMatchObject({ requesterId: 'release_next', actions: { close: { allowed: false, reason: 'Only the Requester, release_next, can close this.' } }, release: { exposureDate: '2026-10-21', dueDate: '2026-10-28' } });
});
it('does not restart the Done undo clock and refuses edits to any earlier audit event', async () => {
    const api = await import('./release-actions');
    const id = await fixture();
    const [before] = await connection `select updated_at from requests where id=${id}`;
    await api.changeRequestRelease(context(id), release);
    const [after] = await connection `select updated_at from requests where id=${id}`;
    expect(after.updated_at).toEqual(before.updated_at);
    await expect(connection `update requests set release_state=jsonb_set(release_state,'{history,0,input,evidence}','"rewritten"') where id=${id}`).rejects.toThrow(/immutable/);
    await expect(connection `delete from requests where id=${id}`).rejects.toThrow(/immutable/);
});
it('any active member records, corrects and voids a release, each attributed to them; a guest cannot', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-25T00:00:00Z'));
    const api = await import('./release-actions');
    const id = await fixture();
    session.userId = 'release_developer';
    expect(await api.readRequestRelease(id, { orgId })).toMatchObject({ requesterId: 'release_owner', requesterName: 'release_owner', journey: { status: 'done' }, workStatus: 'done', pickedUpAt: null, doneAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/), actions: { release: { allowed: true }, close: { allowed: false, reason: 'Only the Requester, release_owner, can close this.' } } });
    expect(await api.changeRequestRelease(context(id), release)).toHaveProperty('success', true);
    session.userId = 'release_pm';
    expect(await api.readRequestRelease(id, { orgId })).toMatchObject({ journey: { status: 'measuring', label: 'Measuring' }, actions: { correctRelease: { allowed: true }, voidRelease: { allowed: true }, release: { allowed: false, reason: 'The release is already recorded.' } } });
    expect(await api.changeRequestRelease(context(id, 1), { ...release, kind: 'correct', exposureDate: '2026-10-20', reason: 'Verified original exposure log' })).toHaveProperty('success', true);
    session.userId = 'release_admin';
    session.role = 'admin';
    expect(await api.changeRequestRelease(context(id, 2), { kind: 'void', reason: 'Only staging was exposed', neverExposed: true })).toHaveProperty('success', true);
    session.userId = 'release_designer';
    session.role = 'guest';
    expect(await api.readRequestRelease(id, { orgId })).toHaveProperty('error');
    session.userId = 'release_owner';
    expect(await api.readRequestRelease(id, { orgId })).toMatchObject({ actions: { release: { allowed: false, reason: 'Guests can follow this Request but can’t change it.' } } });
    expect(await api.changeRequestRelease(context(id, 3), release)).toHaveProperty('error');
    const [row] = await connection `select release_state from requests where id=${id}`;
    expect(row.release_state.ownerId).toBe('release_owner');
    expect(row.release_state.history.map((e: { actorId: string }) => e.actorId)).toEqual(['release_developer', 'release_pm', 'release_admin']);
});
it('nobody records, corrects or voids a release once the Request is closed', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-25T00:00:00Z'));
    const api = await import('./release-actions');
    const outcome = await import('./outcome-actions');
    const closedReleased = await fixture();
    await api.changeRequestRelease(context(closedReleased), release);
    expect(await outcome.changeRequestOutcome(context(closedReleased, 1), { kind: 'exception', reasonCode: 'rolled_back', reason: '' })).toHaveProperty('success', true);
    const closedEarly = await fixture();
    expect(await outcome.changeRequestOutcome(context(closedEarly), { kind: 'exception', reasonCode: 'cannot_measure', reason: 'No analytics' })).toHaveProperty('success', true);
    for (const userId of ['release_owner', 'release_pm']) {
        session.userId = userId;
        expect(await api.changeRequestRelease(context(closedReleased, 2), { ...release, kind: 'correct', reason: 'Late fix' })).toEqual({ error: 'This Request is closed.' });
        expect(await api.changeRequestRelease(context(closedReleased, 2), { kind: 'void', reason: 'Late void', neverExposed: true })).toEqual({ error: 'This Request is closed.' });
        expect(await api.changeRequestRelease(context(closedEarly, 1), release)).toEqual({ error: 'This Request is closed.' });
        expect(await api.readRequestRelease(closedEarly, { orgId })).toMatchObject({ journey: { label: 'Closed without a result' }, actions: { release: { allowed: false, reason: 'This Request is closed.' } } });
    }
});
it('an admin hands over an In progress Request before any release, creating the release record with no release', async () => {
    const api = await import('./release-actions');
    const id = await fixture();
    await connection `update requests set status='in_progress' where id=${id}`;
    const [open] = await connection `insert into requests(org_id,title,description,created_by,status) values (${orgId},'Not started','No pickup','release_owner','open') returning id`;
    await removeMember(orgId, 'release_owner');
    session.userId = 'release_admin';
    session.role = 'admin';
    const handover = { kind: 'transfer', recipientId: 'release_next', reason: 'Requester left the workspace' };
    expect(await api.changeRequestRelease(context(open.id), handover)).toEqual({ error: 'Handover opens once the work is picked up.' });
    expect(await api.readRequestRelease(id, { orgId })).toMatchObject({ journey: { status: 'in_progress' }, actions: { handover: { allowed: true }, release: { allowed: false, reason: 'Opens once the work is Done.' } } });
    expect(await api.changeRequestRelease(context(id), handover)).toEqual({ success: true, revision: 1 });
    const [row] = await connection `select status,release_state from requests where id=${id}`;
    expect(row.status).toBe('in_progress');
    expect(row.release_state).toMatchObject({ ownerId: 'release_next', release: null, history: [{ actorId: 'release_admin', previousOwnerId: 'release_owner', ownerId: 'release_next', release: null, previousRelease: null }] });
    expect(await api.readRequestRelease(id, { orgId })).toMatchObject({ requesterId: 'release_next', actions: { handover: { allowed: false, reason: 'release_next still has workspace access.' } } });
    session.userId = 'release_pm';
    session.role = 'member';
    await removeMember(orgId, 'release_next');
    expect(await api.changeRequestRelease(context(id, 1), { ...handover, recipientId: 'release_pm' })).toEqual({ error: 'Only a workspace admin can hand this over.' });
});
it('requires the value before release for a measured plan: never blank, never another unit, kept on the release and its correction (#151 decision 3)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-25T00:00:00Z'));
    const api = await import('./release-actions');
    const id = await fixture();
    const withoutValue = { ...release, valueBeforeRelease: undefined };
    expect(await api.changeRequestRelease(context(id), withoutValue)).toHaveProperty('error');
    expect(await api.changeRequestRelease(context(id), { ...release, valueBeforeRelease: { value: null, unit: '%' } })).toHaveProperty('error');
    expect(await api.changeRequestRelease(context(id), { ...release, valueBeforeRelease: { value: 50, unit: 'seconds' } })).toEqual({ error: 'Enter the value before release in %.' });
    expect(await api.readRequestRelease(id, { orgId })).toMatchObject({ release: null, valueBefore: { required: true, unit: '%', current: 50 } });
    // #277: the release form starts from the goal's current value; the person changes it if the value moved.
    expect(await api.changeRequestRelease(context(id), release)).toEqual({ success: true, revision: 1 });
    expect(await api.changeRequestRelease(context(id, 1), { ...withoutValue, kind: 'correct', reason: 'Wrong log' })).toHaveProperty('error');
    expect(await api.changeRequestRelease(context(id, 1), { ...release, kind: 'correct', valueBeforeRelease: { value: 48, unit: '%' }, reason: 'Wrong log' })).toHaveProperty('success', true);
    expect(await api.readRequestRelease(id, { orgId })).toMatchObject({ recordedValueBefore: { value: 48, unit: '%' } });
    const [row] = await connection `select release_state from requests where id=${id}`;
    expect(row.release_state.history[0].input.valueBeforeRelease).toEqual({ value: 50, unit: '%' });
    expect(row.release_state.history[1].input.valueBeforeRelease).toEqual({ value: 48, unit: '%' });
});
it('does not ask for a value before release on a verified check', async () => {
    const api = await import('./release-actions');
    const id = await fixture();
    const impact = { kind: 'verification', result: 'Keyboard checkout works', source: 'Checklist', reviewAfterDays: 14 };
    await connection `update requests set expected_impact=${connection.json(impact)} where id=${id}`;
    expect(await api.readRequestRelease(id, { orgId })).toMatchObject({ valueBefore: { required: false, unit: null } });
    expect(await api.changeRequestRelease(context(id), { ...release, valueBeforeRelease: undefined })).toEqual({ success: true, revision: 1 });
    const [row] = await connection `select release_state from requests where id=${id}`;
    expect(row.release_state.history[0].input.valueBeforeRelease ?? null).toBeNull();
    expect(await api.readRequestRelease(id, { orgId })).toMatchObject({ recordedValueBefore: null });
});

it('retains the operation id and workspace while a real expired release action renews once', async () => {
    const api = await import('./release-actions');
    const id = await fixture();
    const ctx = context(id);
    const attempts: typeof ctx[] = [];
    session.userId = '';
    const result = await callAction(async () => {
        attempts.push({ ...ctx });
        return api.changeRequestRelease(ctx, release);
    }, { current: async () => 'old', renew: async () => { session.userId = 'release_pm'; return 'renewed'; } });
    expect(result).toEqual({ success: true, revision: 1 });
    expect(attempts).toEqual([ctx, ctx]);
    const [row] = await connection`select release_state, agreement_revision from requests where id=${id}`;
    expect(row.agreement_revision).toBe(1);
    expect(row.release_state.history).toHaveLength(1);
    expect(row.release_state.history[0]).toMatchObject({ operationId: ctx.operationId, actorId: 'release_pm' });
    // An explicit manual retry of the same operation remains idempotent defense.
    expect(await api.changeRequestRelease(ctx, release)).toEqual(result);
});
