import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildLocalBaseline } from "./local-baseline";

const enumNames = [
  "classification", "notification_type", "plan", "request_status", "role",
] as const;
const functionSql = `CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;`;
const definitions = [
  ...enumNames.map((name) => ({
    name, type: "TYPE", sql: `CREATE TYPE public.${name} AS ENUM ('test_value');`,
  })),
  { name: "set_updated_at()", type: "FUNCTION", sql: functionSql },
];

function block(name: string, type: string, schema: string, sql: string) {
  return `--\n-- Name: ${name}; Type: ${type}; Schema: ${schema}; Owner: -\n--\n\n${sql}\n\n`;
}

function fixture(omit?: string) {
  return [
    "SET check_function_bodies = false;\nSET row_security = off;\n",
    block("supabase_vault", "EXTENSION", "-", "CREATE EXTENSION supabase_vault WITH SCHEMA vault;"),
    block("users", "TABLE", "auth", "CREATE TABLE auth.users (id uuid);"),
    ...definitions.filter(({ name }) => name !== omit).map(({ name, type, sql }) => block(name, type, "public", sql)),
    block("profiles", "TABLE", "public", "CREATE TABLE public.profiles (id uuid REFERENCES auth.users(id));"),
    block("profiles_select_same_org", "POLICY", "public", "CREATE POLICY profiles_select_same_org ON public.profiles TO authenticated USING (true);"),
    block("ensure_rls", "EVENT TRIGGER", "-", "CREATE EVENT TRIGGER ensure_rls ON ddl_command_end EXECUTE FUNCTION public.rls_auto_enable();"),
    "\\unrestrict legacy_dump_token\n",
  ].join("");
}

describe("local post-Clerk baseline prerequisites", () => {
  it("copies only canonical prerequisite definitions, including the complete trigger body", () => {
    const sql = buildLocalBaseline(fixture());
    expect(sql).toBe(`BEGIN;\n\n${definitions.map(({ sql }) => sql).join("\n\n")}\n\nCOMMIT;\n`);
  });

  it.each(definitions)("fails closed when $name is missing", ({ name }) => {
    expect(() => buildLocalBaseline(fixture(name))).toThrow(`Expected exactly one canonical public.${name}`);
  });

  it.each(definitions)("rejects duplicate $name definitions", ({ name, type, sql }) => {
    expect(() => buildLocalBaseline(fixture() + block(name, type, "public", sql)))
      .toThrow(`Expected exactly one canonical public.${name}`);
  });

  it("does not substitute a same-name provider object for a public prerequisite", () => {
    const sql = fixture("role") + block("role", "TYPE", "auth", "CREATE TYPE auth.role AS ENUM ('admin');");
    expect(() => buildLocalBaseline(sql)).toThrow("Expected exactly one canonical public.role");
  });

  it("rejects an empty or mismatched named prerequisite instead of deferring it to reset", () => {
    expect(() => buildLocalBaseline(fixture("role") + block("role", "TYPE", "public", "")))
      .toThrow("Invalid canonical definition for public.role");
    expect(() => buildLocalBaseline(fixture("role") + block("role", "TYPE", "public", "CREATE TYPE auth.role AS ENUM ('admin');")))
      .toThrow("Invalid canonical definition for public.role");
  });

  it("retains changes to canonical enum values and function bodies without a duplicated schema", () => {
    const changed = fixture()
      .replace("public.role AS ENUM ('test_value')", "public.role AS ENUM ('pm', 'designer', 'developer', 'future_label')")
      .replace("NEW.updated_at = now();", "NEW.updated_at = statement_timestamp();");
    const sql = buildLocalBaseline(changed);
    expect(sql).toContain("public.role AS ENUM ('pm', 'designer', 'developer', 'future_label')");
    expect(sql).toContain(functionSql.replace("now()", "statement_timestamp()"));
  });

  it("supports CRLF dump headers without changing definition contents", () => {
    const sql = buildLocalBaseline(fixture().replaceAll("\n", "\r\n"));
    expect(sql).toContain(functionSql.replaceAll("\n", "\r\n"));
  });

  it("accepts the repository baseline without provider extensions, tables, or policy shims", () => {
    const baseline = readFileSync(path.resolve(__dirname, "../db/baseline.sql"), "utf8");
    const sql = buildLocalBaseline(baseline);
    expect(sql.match(/CREATE TYPE public\./g)).toHaveLength(5);
    expect(sql.match(/CREATE FUNCTION public\./g)).toHaveLength(1);
    expect(sql).toContain(functionSql);
    expect(sql).toContain("'problem',\n    'solution',\n    'hybrid'");
    expect(sql).not.toMatch(/CREATE (?:SCHEMA|EXTENSION|TABLE|POLICY|EVENT TRIGGER)|SET row_security|\\(?:un)?restrict/);
  });
});
