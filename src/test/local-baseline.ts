const prerequisites = [
  { name: "classification", type: "TYPE" },
  { name: "notification_type", type: "TYPE" },
  { name: "plan", type: "TYPE" },
  { name: "request_status", type: "TYPE" },
  { name: "role", type: "TYPE" },
  { name: "set_updated_at()", type: "FUNCTION" },
] as const;

/**
 * Prerequisites for the fresh, post-Clerk schema on plain local PostgreSQL.
 *
 * baseline.sql is a hosted Supabase dump, not a portable database bootstrap.
 * 0013 replaces all Lane tables and 0014 restores their timestamp triggers/RLS.
 * Copy only the definitions those unchanged migrations retain from the dump:
 * five enums and set_updated_at(). Never duplicate their SQL in a local schema.
 *
 * Deliberately excluded: Supabase auth/storage/realtime/extension infrastructure,
 * provider roles/grants/event triggers, dump session settings, and pre-Clerk
 * public tables/functions/policies replaced by 0013. PostgreSQL provides
 * gen_random_uuid() natively. This is NOT a historical upgrade or hosted
 * Supabase compatibility test. Canonical migrations must still run afterward
 * with ON_ERROR_STOP; no SQL failure is swallowed here.
 */
export function buildLocalBaseline(baseline: string): string {
  // Use pg_dump object boundaries, not semicolons: function bodies contain
  // multiple statements and must survive byte-for-byte (apart from whitespace
  // surrounding the object). Reject drift before the caller resets its database.
  const headers = [...baseline.matchAll(
    /^--\r?\n-- Name: ([^\r\n]+); Type: ([^;\r\n]+); Schema: ([^;\r\n]+); Owner: [^\r\n]*\r?\n--(?:\r?\n|$)/gm
  )];
  const sections = headers.map((header, index) => ({
    name: header[1],
    type: header[2],
    schema: header[3],
    sql: baseline.slice(
      header.index + header[0].length,
      headers[index + 1]?.index ?? baseline.length,
    ).trim(),
  }));

  const definitions = prerequisites.map(({ name, type }) => {
    const matches = sections.filter((section) =>
      section.name === name && section.type === type && section.schema === "public"
    );
    if (matches.length !== 1) {
      throw new Error(`[test-setup] Expected exactly one canonical public.${name} ${type}; found ${matches.length}.`);
    }

    const sql = matches[0].sql;
    const start = type === "TYPE"
      ? `CREATE TYPE public.${name} AS ENUM (`
      : `CREATE FUNCTION public.${name} RETURNS trigger`;
    if (!sql.startsWith(start) || !sql.endsWith(";")) {
      throw new Error(`[test-setup] Invalid canonical definition for public.${name}.`);
    }
    return sql;
  });

  return `BEGIN;\n\n${definitions.join("\n\n")}\n\nCOMMIT;\n`;
}
