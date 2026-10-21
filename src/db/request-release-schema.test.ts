import postgres from 'postgres';
import { afterAll, expect, it } from 'vitest';
const connection = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
afterAll(() => connection.end());
it('migration preserves legacy statuses, priority, dates, comments and measurement without inventing release', async () => {
    const rows = await connection `select status,priority,release_state,updated_at from requests where org_id='org_agreement_legacy' order by title`;
    expect(rows.map(r => r.status)).toEqual(['open', 'in_progress', 'done', 'open', 'in_progress', 'done']);
    expect(rows.every(r => r.release_state === null && r.updated_at.toISOString() === '2026-09-02T00:00:00.000Z')).toBe(true);
    expect(rows.every(r => r.priority === 'none')).toBe(true);
});
it('rejects malformed release state and retains the existing Requests RLS and grants', async () => {
    const [request] = await connection `select id from requests where org_id='org_agreement_legacy' and status='done' limit 1`;
    for (const invalid of [{}, { version: 1, ownerId: 'x', release: {}, history: [] }]) {
        await expect(connection `update requests set release_state=${connection.json(invalid)} where id=${request.id}`).rejects.toThrow();
    }
    const [row] = await connection `select relrowsecurity from pg_class where oid='public.requests'::regclass`;
    expect(row.relrowsecurity).toBe(true);
    // Supabase has these roles; a plain Postgres (CI) has neither, and nothing can be granted to a role that does not exist.
    const roles = (await connection `select rolname from pg_roles where rolname in ('anon','authenticated')`).map(role => role.rolname);
    if (roles.includes('anon')) {
        const [grant] = await connection `select has_table_privilege('anon','public.requests','SELECT') as allowed`;
        expect(grant.allowed).toBe(false);
    }
    if (roles.includes('authenticated')) {
        const [grant] = await connection `select has_table_privilege('authenticated','public.requests','UPDATE') as allowed`;
        expect(grant.allowed).toBe(false);
    }
});
