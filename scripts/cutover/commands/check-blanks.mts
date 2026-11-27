// `check-blanks`, read-only, after real sign-ups (#410 story 46): Lane stores no Google photo and no workspace logo or
// metadata, so profiles.image, organizations.logo and organizations.metadata must all be NULL.
import type { Command } from "../command.mts";
import { readOnly } from "../database.mts";

const COLUMNS = [
  { key: "profileImages", table: "profiles", column: "image" },
  { key: "workspaceLogos", table: "organizations", column: "logo" },
  { key: "workspaceMetadata", table: "organizations", column: "metadata" },
] as const;

export const checkBlanks: Command = {
  name: "check-blanks",
  usage: "check-blanks <staging|production|rehearsal>",
  environments: 1,
  bucket: false,
  async run({ targets: [target], print, logStep }) {
    const counts = await readOnly(target.database, async (sql) => {
      const [present] = await sql<{ columns: number }[]>`
        select count(*)::int as columns from information_schema.columns
        where table_schema = 'public' and (table_name, column_name) in (('profiles', 'image'), ('organizations', 'logo'), ('organizations', 'metadata'))`;
      if (present.columns !== COLUMNS.length) return undefined;
      const values: Record<string, number> = {};
      for (const { key, table, column } of COLUMNS) {
        const [row] = await sql<{ rows: number }[]>`select count(*)::int as rows from ${sql(`public.${table}`)} where ${sql(column)} is not null`;
        values[key] = row.rows;
      }
      return values;
    });
    if (!counts) {
      logStep({ step: "check-blanks", result: "stop", detail: "0055's columns aren't there" });
      print("STOP: profiles.image, organizations.logo and organizations.metadata aren't all there. Is 0055 applied?");
      return "stop";
    }
    const filled = COLUMNS.filter(({ key }) => counts[key] > 0);
    for (const { key, table, column } of filled) print(`STOP: ${table}.${column} holds a value in ${counts[key]} row(s). Lane keeps it empty.`);
    const result = filled.length ? "stop" : "ok";
    logStep({ step: "check-blanks", result, counts });
    print(result === "ok" ? "Check blanks: ok. No profile image, workspace logo or workspace metadata. Nothing was changed." : "Check blanks: stop. Nothing was changed.");
    return result;
  },
};
