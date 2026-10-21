import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, expect, it } from 'vitest';
const connection = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
beforeAll(async () => { await connection `insert into organizations(id,name,slug) values ('org_outcome_schema','Outcome schema','outcome-schema')`; });
afterAll(() => connection.end());
const fingerprint = 'a'.repeat(64);
const exception = (reasonCode = 'other') => ({ version: 1, kind: 'exception', reasonCode, reason: 'Never launched', actorId: 'user_test_admin_a', ownerId: 'user_test_admin_a', closedAt: '2026-10-21T00:00:00.000Z', operationId: randomUUID(), fingerprint, release: null, revision: 1 });
const correction = (revision: number) => ({ operationId: randomUUID(), fingerprint, actorId: 'user_test_admin_a', at: '2026-10-22T00:00:00.000Z', field: 'reason', correction: 'It was paused, not cancelled', reason: 'Wrong wording', revision });
async function legacyRow(status = 'open') {
    const [row] = await connection `insert into requests(org_id,title,description,created_by,status) values ('org_outcome_schema','Outcome schema','Fixture','user_test_admin_a',${status}) returning id`;
    return row.id as string;
}
it('migration preserves legacy Requests without inventing closures, corrections or follow-up links', async () => {
    const rows = await connection `select status,exception_closure,outcome_closure,closure_corrections,follow_up_of,expected_impact,updated_at from requests where org_id='org_agreement_legacy' and title like 'Legacy %' order by title`;
    expect(rows.map(r => r.status)).toEqual(['open', 'in_progress', 'done', 'open', 'in_progress', 'done']);
    expect(rows.every(r => r.exception_closure === null && r.outcome_closure === null && r.follow_up_of === null)).toBe(true);
    expect(rows.every(r => Array.isArray(r.closure_corrections) && r.closure_corrections.length === 0)).toBe(true);
    expect(rows[1].expected_impact).toMatchObject({ kind: 'metric', baseline: 50, target: 80 });
    expect(rows.every(r => r.updated_at.toISOString() === '2026-09-02T00:00:00.000Z')).toBe(true);
});
it('accepts the three reasons after pickup only, and rejects invented, superseded or dual closures', async () => {
    for (const code of ['rolled_back', 'cannot_measure', 'other']) {
        const id = await legacyRow('in_progress');
        await connection `update requests set exception_closure=${connection.json(exception(code))} where id=${id}`;
    }
    const blank = await legacyRow('done');
    await connection `update requests set exception_closure=${connection.json({ ...exception('cannot_measure'), reason: '' })} where id=${blank}`;
    await expect(connection `update requests set exception_closure=${connection.json(exception())} where id=${await legacyRow()}`).rejects.toThrow(/after_pickup/);
    const id = await legacyRow('in_progress');
    for (const invalid of [{ ...exception(), reasonCode: 'superseded' }, { ...exception(), reason: ' ' }, { ...exception(), reasonCode: 'cancelled' }, { ...exception(), version: 2 }])
        await expect(connection `update requests set exception_closure=${connection.json(invalid)} where id=${id}`).rejects.toThrow();
    for (const invalid of [{}, { version: 1, kind: 'measured' }])
        await expect(connection `update requests set outcome_closure=${connection.json(invalid)} where id=${id}`).rejects.toThrow();
    await expect(connection `update requests set closure_corrections=${connection.json([correction(1)])} where id=${id}`).rejects.toThrow();
});
it('a closed Request only accepts one appended correction at a time and never reopens', async () => {
    const id = await legacyRow('in_progress');
    await connection `update requests set exception_closure=${connection.json(exception('cannot_measure'))}, agreement_revision=1 where id=${id}`;
    await connection `update requests set closure_corrections=${connection.json([correction(2)])}, agreement_revision=2 where id=${id}`;
    const [row] = await connection `select closure_corrections from requests where id=${id}`;
    await expect(connection `update requests set closure_corrections='[]' where id=${id}`).rejects.toThrow(/immutable/);
    await expect(connection `update requests set closure_corrections=${connection.json([...row.closure_corrections, correction(3), correction(4)])} where id=${id}`).rejects.toThrow(/immutable/);
    await expect(connection `update requests set closure_corrections=${connection.json([{ ...row.closure_corrections[0], correction: 'rewritten' }, correction(3)])} where id=${id}`).rejects.toThrow(/immutable/);
    await expect(connection `update requests set closure_corrections=${connection.json([...row.closure_corrections, correction(3)])} where id=${id}`).rejects.toThrow(/immutable/);
    await expect(connection `update requests set agreement_revision=3 where id=${id}`).rejects.toThrow(/immutable/);
    for (const change of [connection `update requests set exception_closure=null where id=${id}`, connection `update requests set status='done' where id=${id}`, connection `update requests set title='Rewritten' where id=${id}`, connection `delete from requests where id=${id}`])
        await expect(change).rejects.toThrow(/immutable/);
});
it('follow-up links stay inside the workspace and cannot be rewritten', async () => {
    const original = await legacyRow('done');
    const [follow] = await connection `insert into requests(org_id,title,description,created_by,follow_up_of) values ('org_outcome_schema','Follow-up','Fixture','user_test_admin_a',${original}) returning id`;
    await expect(connection `update requests set follow_up_of=null where id=${follow.id}`).rejects.toThrow(/immutable/);
    const [foreign] = await connection `select id from requests where org_id<>'org_outcome_schema' limit 1`;
    await expect(connection `insert into requests(org_id,title,description,created_by,follow_up_of) values ('org_outcome_schema','Cross','Fixture','user_test_admin_a',${foreign.id})`).rejects.toThrow();
});
it('a closed Request accepts only one appended transfer and never rewrites release history', async () => {
    const id = await legacyRow('done');
    const event = (kind: string, revision: number) => ({ operationId: randomUUID(), fingerprint, actorId: 'user_test_admin_a', at: '2026-10-21T00:00:00.000Z', input: { kind }, previousRelease: null, release: null, previousOwnerId: 'user_test_admin_a', ownerId: 'user_test_admin_a', revision });
    const state = (history: postgres.JSONValue[]) => ({ version: 1, ownerId: 'user_test_admin_a', release: null, history });
    const first = event('transfer', 1);
    await connection `update requests set release_state=${connection.json(state([first]))}, agreement_revision=1 where id=${id}`;
    await connection `update requests set exception_closure=${connection.json(exception('cannot_measure'))}, agreement_revision=2 where id=${id}`;
    await expect(connection `update requests set release_state=${connection.json(state([event('transfer', 3)]))}, agreement_revision=3 where id=${id}`).rejects.toThrow(/immutable/);
    await expect(connection `update requests set release_state=${connection.json(state([first, event('void', 3)]))}, agreement_revision=3 where id=${id}`).rejects.toThrow(/immutable/);
    await connection `update requests set release_state=${connection.json(state([first, event('transfer', 3)]))}, agreement_revision=3 where id=${id}`;
});
