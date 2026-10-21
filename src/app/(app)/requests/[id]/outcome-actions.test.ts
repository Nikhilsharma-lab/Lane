import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, afterEach, expect, it, vi } from 'vitest';
const session = vi.hoisted(() => ({ userId: 'outcome_owner', orgId: 'org_outcome', orgRole: 'org:member' }));
const everyone = ['outcome_owner', 'outcome_pm', 'outcome_designer', 'outcome_developer', 'outcome_admin', 'outcome_next'];
const roster = vi.hoisted(() => ({ ids: [] as string[] }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@clerk/nextjs/server', () => ({
    auth: async () => ({ ...session }),
    clerkClient: async () => ({ organizations: { getOrganizationMembershipList: async () => ({ totalCount: roster.ids.length, data: roster.ids.map(userId => ({ organization: { id: 'org_outcome' }, role: userId === 'outcome_admin' ? 'org:admin' : 'org:member', publicUserData: { userId, identifier: userId + '@example.test' } })) }) } }),
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
/** A Done Request with complete agreement, optionally released on 21 October (due 28 October). */
async function fixture({ impact = conversion as postgres.JSONValue, released = true } = {}) {
    const [row] = await connection `insert into requests(org_id,title,description,created_by,status,priority,expected_impact) values (${orgId},'Checkout problem','Unable to pay','outcome_owner','done','high',${connection.json(impact)}) returning *`;
    const prepared = { version: 1, scopeIncluded: 'Checkout', scopeExcluded: 'Pricing', audience: 'All shoppers', timing: 'October', constraints: 'Existing API', feasibility: 'Verified', commitmentKind: 'delivery' };
    const seats = Object.fromEntries(['pm', 'designer', 'developer'].map(seat => [seat, { generation: 1, nominee: { kind: 'member', userId: 'outcome_' + seat }, displayNameAtSelection: seat, decision: { kind: 'agree', actorId: 'outcome_' + seat, at: '2026-10-20T00:00:00.000Z', reason: '' } }]));
    await connection `insert into request_agreements(request_id,org_id,prepared,snapshot,seats,submitted_by,submitted_at) values (${row.id},${orgId},${connection.json(prepared)},${connection.json({ version: 1, request: { title: 'Checkout problem', description: 'Unable to pay', expectedImpact: impact }, prepared, attachmentIds: [] })},${connection.json(seats)},'outcome_owner',now())`;
    if (released) {
        const releaseApi = await import('./release-actions');
        const result = await releaseApi.changeRequestRelease(context(row.id, 0), { kind: 'release', exposureDate: '2026-10-21', evidence: 'Full rollout in release log', audienceConfirmed: true });
        if (!('success' in result)) throw Error(result.error);
    }
    return row.id as string;
}
it('closes a measured outcome only from the due date, keeping baseline and target beside the immutable actual', async () => {
    const api = await import('./outcome-actions');
    await at('2026-10-25T12:00:00Z');
    const id = await fixture();
    expect(await api.changeRequestOutcome(context(id, 1), measured)).toEqual({ error: 'Measured closure opens on 2026-10-28 (UTC). Use Close with exception if measurement cannot happen.' });
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
    expect(await api.changeRequestOutcome(context(unreleased, 0), measured)).toEqual({ error: 'Record release before closing with a measured result.' });
});
it('closes with a reasoned exception before the deadline, never inventing a result, and blocks further advancement', async () => {
    const api = await import('./outcome-actions');
    const lifecycle = await import('./actions');
    await at('2026-10-22T00:00:00Z');
    const [open] = await connection `insert into requests(org_id,title,description,created_by,status) values (${orgId},'Legacy open','No agreement','outcome_owner','open') returning id`;
    expect(await api.changeRequestOutcome(context(open.id, 0), { kind: 'exception', reasonCode: 'cancelled', reason: '' })).toHaveProperty('error');
    expect(await api.changeRequestOutcome(context(open.id, 0), { kind: 'exception', reasonCode: 'superseded', reason: 'Use the replacement path' })).toHaveProperty('error');
    expect(await api.changeRequestOutcome(context(open.id, 0), { kind: 'exception', reasonCode: 'rolled_back', reason: 'Nothing shipped' })).toEqual({ error: 'Record release before closing as rolled back or inconclusive.' });
    expect(await api.changeRequestOutcome(context(open.id, 0), { kind: 'exception', reasonCode: 'cancelled', reason: 'Strategy changed before work began' })).toEqual({ success: true, revision: 1 });
    expect(await lifecycle.pickUpRequest(open.id, { orgId })).toEqual({ error: 'This Request is closed with an exception and cannot advance.' });
    const [row] = await connection `select status,outcome_closure,exception_closure from requests where id=${open.id}`;
    expect(row).toMatchObject({ status: 'open', outcome_closure: null, exception_closure: { version: 2, reasonCode: 'cancelled', release: null, actorId: 'outcome_owner' } });
    expect(await api.readRequestOutcome(open.id, { orgId })).toMatchObject({ state: 'closed', agreed: null, closure: { kind: 'exception', reasonCode: 'cancelled', reason: 'Strategy changed before work began' } });
    const released = await fixture();
    expect(await api.changeRequestOutcome(context(released, 1), { kind: 'exception', reasonCode: 'cancelled', reason: 'Too late' })).toEqual({ error: 'Released work cannot close as not launched. Choose rolled back, unavailable or inconclusive.' });
    expect(await api.changeRequestOutcome(context(released, 1), { kind: 'exception', reasonCode: 'rolled_back', reason: 'Payment errors spiked; reverted on 22 October' })).toHaveProperty('success', true);
    expect(await api.readRequestOutcome(released, { orgId })).toMatchObject({ closure: { reasonCode: 'rolled_back', release: { exposureDate: '2026-10-21' } } });
    const releaseApi = await import('./release-actions');
    expect(await releaseApi.changeRequestRelease(context(released, 2), { kind: 'void', reason: 'Undo closure', neverExposed: true })).toEqual({ error: 'This Request is permanently closed.' });
    const unavailable = await fixture();
    expect(await api.changeRequestOutcome(context(unavailable, 1), { kind: 'exception', reasonCode: 'measurement_unavailable', reason: 'Analytics outage lost October data' })).toHaveProperty('success', true);
});
it('a pending linked replacement must be confirmed as Superseded rather than closed another way', async () => {
    const api = await import('./outcome-actions');
    const [original] = await connection `insert into requests(org_id,title,description,created_by,status) values (${orgId},'Original','Context','outcome_owner','open') returning id`;
    const [successor] = await connection `insert into requests(org_id,title,description,created_by,status) values (${orgId},'Successor','Context','outcome_owner','open') returning id`;
    await connection `insert into request_replacements(original_id,replacement_id,org_id,created_by,reason,changed_fields) values (${original.id},${successor.id},${orgId},'outcome_owner','Scope changed','[]')`;
    expect(await api.changeRequestOutcome(context(original.id, 0), { kind: 'exception', reasonCode: 'cancelled', reason: 'Abandon' })).toEqual({ error: 'A linked replacement is pending. Confirm the original as Superseded instead.' });
});
it('only the current owner closes; transfer moves authority, and admins, guests, former owners and foreign workspaces cannot', async () => {
    const api = await import('./outcome-actions');
    const releaseApi = await import('./release-actions');
    await at('2026-10-28T00:00:00Z');
    const id = await fixture();
    session.userId = 'outcome_admin';
    session.orgRole = 'org:admin';
    expect(await api.changeRequestOutcome(context(id, 1), measured)).toEqual({ error: 'Only the current release and outcome owner can do this.' });
    session.userId = 'outcome_pm';
    session.orgRole = 'org:member';
    expect(await api.changeRequestOutcome(context(id, 1), { kind: 'exception', reasonCode: 'inconclusive', reason: 'PM disagrees' })).toHaveProperty('error');
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
    expect(await api.changeRequestOutcome(context(id, 2), measured)).toEqual({ error: 'Only the current release and outcome owner can do this.' });
    session.userId = 'outcome_next';
    expect(await api.readRequestOutcome(id, { orgId })).toMatchObject({ ownerId: 'outcome_next', canClose: true, canCloseException: true, canCorrect: false });
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
    expect(await releaseApi.readRequestRelease(id, { orgId })).toMatchObject({ canTransfer: true, canCorrect: false });
    expect(await releaseApi.changeRequestRelease(context(id, 2), { kind: 'transfer', recipientId: 'outcome_next', reason: 'Owner left after closing' })).toEqual({ success: true, revision: 3 });
    expect(await releaseApi.changeRequestRelease(context(id, 3), { kind: 'release', exposureDate: '2026-10-22', evidence: 'x', audienceConfirmed: true })).toHaveProperty('error');
    session.userId = 'outcome_next';
    session.orgRole = 'org:member';
    expect(await releaseApi.readRequestRelease(id, { orgId })).toMatchObject({ canCorrect: false, canRelease: false });
    expect(await api.readRequestOutcome(id, { orgId })).toMatchObject({ canCorrect: true, canClose: false });
});
it('appends attributable corrections beside the immutable closure, with lost-response retry and no rewriting', async () => {
    const api = await import('./outcome-actions');
    await at('2026-10-28T00:00:00Z');
    const id = await fixture();
    const fix = { kind: 'correction', field: 'evidence', correction: 'The export covered 21–27 October', reason: 'Dashboard date range was mislabelled' };
    expect(await api.changeRequestOutcome(context(id, 1), fix)).toEqual({ error: 'Only a Closed Request takes corrections.' });
    await api.changeRequestOutcome(context(id, 1), measured);
    for (const invalid of [{ ...fix, reason: '' }, { ...fix, field: 'target' }, { ...fix, correction: ' ' }])
        expect(await api.changeRequestOutcome(context(id, 2), invalid)).toHaveProperty('error');
    session.userId = 'outcome_pm';
    expect(await api.changeRequestOutcome(context(id, 2), fix)).toEqual({ error: 'Only the current release and outcome owner can do this.' });
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
    await api.changeRequestOutcome(context(exceptional, 1), { kind: 'exception', reasonCode: 'inconclusive', reason: 'Too few sessions' });
    expect(await api.changeRequestOutcome(context(exceptional, 2), { ...fix, field: 'actual', correction: 'Invented 61%' })).toEqual({ error: 'Choose a part of this closure to correct.' });
    expect(await api.changeRequestOutcome(context(exceptional, 2), { ...fix, field: 'reason', correction: 'Holiday traffic, not too few sessions' })).toHaveProperty('success', true);
    expect(await api.readRequestOutcome(exceptional, { orgId })).toMatchObject({ closure: { reason: 'Too few sessions' }, corrections: [{ field: 'reason' }] });
});
it('creates linked follow-ups after release with copied context and fresh agreement, leaving the original obligation intact', async () => {
    const api = await import('./outcome-actions');
    const lifecycle = await import('./actions');
    await at('2026-10-24T00:00:00Z');
    const unreleased = await fixture({ released: false });
    expect(await api.createFollowUpRequest(context(unreleased, 0), { reason: 'Too early' })).toEqual({ error: 'Follow-ups start after release. Before release, create a linked replacement.' });
    const id = await fixture();
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
    const [follow] = await connection `select r.title,r.created_by,r.status,r.follow_up_of,r.expected_impact,a.snapshot,a.seats from requests r join request_agreements a on a.request_id=r.id where r.id=${followUpId}`;
    expect(follow).toMatchObject({ title: 'Checkout problem', created_by: 'outcome_designer', status: 'open', follow_up_of: id, snapshot: null, expected_impact: { primary: { target: 80 } } });
    expect(Object.values(follow.seats as Record<string, { decision: unknown }>).every(seat => seat.decision === null)).toBe(true);
    expect(await lifecycle.pickUpRequest(followUpId, { orgId })).toHaveProperty('error');
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
    const raced = await Promise.all([api.changeRequestOutcome(context(other, 1), measured), api.changeRequestOutcome(context(other, 1), { kind: 'exception', reasonCode: 'inconclusive', reason: 'Second tab' })]);
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
    const close = api.changeRequestOutcome(context(id, 1), { kind: 'exception', reasonCode: 'measurement_unavailable', reason: 'Owner closing' });
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
