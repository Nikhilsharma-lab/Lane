// #411: the kit uses only what Lane already depends on (the Postgres client and the Supabase client), Node itself,
// and local tools: the clipboard, and from #412 pg_dump, pg_restore, psql and gpg. No new npm dependency.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";

const KIT = __dirname;
const PACKAGES = ["postgres", "@supabase/supabase-js"];
const TOOLS = ["pbpaste", "pbcopy", "pg_dump", "pg_restore", "psql", "gpg", "createdb", "dropdb"];

const kitFiles = readdirSync(KIT, { recursive: true, encoding: "utf8" }).filter((file) => file.endsWith(".mts"));

it.each(kitFiles)("%s imports only Node, the Postgres client, the Supabase client and the kit's own files", (file) => {
  const source = readFileSync(path.join(KIT, file), "utf8");
  const imports = [...source.matchAll(/^(?:import|export)\b[^;]*?\bfrom\s+"([^"]+)"/gm)].map((match) => match[1]);
  const outside = imports.filter((name) => !name.startsWith("node:") && !PACKAGES.includes(name) && !(name.startsWith(".") && name.endsWith(".mts")));
  expect(outside).toEqual([]);
});

it.each(kitFiles)("%s runs only the local tools the kit is allowed", (file) => {
  const source = readFileSync(path.join(KIT, file), "utf8");
  const tools = [...source.matchAll(/\b(?:execFileSync|execFile|spawnSync|spawn)\(\s*"([^"]+)"/g)].map((match) => match[1]);
  expect(tools.filter((tool) => !TOOLS.includes(tool))).toEqual([]);
});
