// `export` (#410 runbook step 1, stories 21–24): with Clerk still live, one rollback copy of an environment. A
// custom-format pg_dump of `public` with its ACLs, every object in request-attachments, and a manifest, encrypted into
// one archive with gpg (symmetric, AES256, a passphrase gpg asks for). The archive is checked by decrypting it again,
// and the plain copies, which only ever sit in the run's owner-only folder, are removed. The export holds password
// hashes and sessions from now on (#333 Q9): it lives in the git-ignored working folder and is deleted at 28 days.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { writeTar } from "../archive.mts";
import type { Command } from "../command.mts";
import { connect, type Sql } from "../database.mts";
import { deleteBy, DUMP, exportName, FILES, KEEP_DAYS, MANIFEST, readTables, writeJsonOnce, type ExportedFile, type ExportRecord, type Manifest } from "../exports.mts";
import { decrypt, encrypt } from "../gpg.mts";
import { presentMigrations } from "../migrations.mts";
import { pgConnection, runTool } from "../tools.mts";

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

function sha256OfFile(file: string): string {
  return sha256(readFileSync(file));
}

export const exportCommand: Command = {
  name: "export",
  usage: "export <staging|production|rehearsal> [--folder <lane_rehearsal_… folder>]",
  environments: 1,
  bucket: true,
  async run({ targets: [target], workingFolder, pgpassFile, privateFolder, atExit, print, logStep }) {
    const takenAt = new Date();
    const name = exportName(target.environment, takenAt);
    const folder = path.join(workingFolder, target.environment, name);
    const plain = path.join(privateFolder, "export");
    const removePlain = () => rmSync(plain, { recursive: true, force: true });
    atExit(removePlain);
    let finished = false;
    atExit(() => finished || rmSync(folder, { recursive: true, force: true }));
    mkdirSync(path.join(plain, FILES), { recursive: true, mode: 0o700 });
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    try {
      // The dump and the manifest's tables are read in one snapshot, so the counts describe exactly what was dumped.
      const pg = pgConnection(target.database, pgpassFile);
      const dumpFile = path.join(plain, DUMP);
      const sql = connect(target.database);
      let tables: Manifest["tables"] = {};
      let latestMigration: string | null = null;
      try {
        await sql.begin("isolation level repeatable read read only", async (transaction) => {
          const read = transaction as unknown as Sql;
          const [{ snapshot }] = await read<{ snapshot: string }[]>`select pg_export_snapshot() as snapshot`;
          tables = await readTables(read);
          latestMigration = (await presentMigrations(read)).at(-1) ?? null;
          print(`Dumping public from ${target.label}…`);
          await runTool("pg_dump", [...pg.args, "--dbname", target.database.database, "--format=custom", "--schema=public", "--snapshot", snapshot, "--file", dumpFile], { env: pg.env });
        });
      } finally {
        await sql.end();
      }
      const listed = await runTool("pg_restore", ["--list", dumpFile], { env: pg.env });
      const undumped = Object.keys(tables).filter((table) => !listed.includes(`TABLE DATA public ${table} `));
      if (undumped.length) throw new Error(`The dump has no data for ${undumped.join(", ")}. The export was not kept.`);

      const objects = await target.bucket!.list();
      print(`Copying ${objects.length} files from ${target.bucket!.description}…`);
      const files: ExportedFile[] = [];
      for (const object of objects) {
        const bytes = await target.bucket!.read(object.path);
        const file = path.join(plain, FILES, object.path);
        mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
        writeFileSync(file, bytes, { mode: 0o600 });
        files.push({ path: object.path, size: bytes.length, contentType: object.contentType, sha256: sha256(bytes) });
      }

      const manifest: Manifest = {
        format: "lane-cutover-export/1",
        environment: target.environment,
        takenAt: takenAt.toISOString(),
        deleteBy: deleteBy(takenAt),
        latestMigration,
        tables,
        files,
        dump: { file: DUMP, sha256: sha256OfFile(dumpFile), bytes: statSync(dumpFile).size },
      };
      writeFileSync(path.join(plain, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
      const tar = path.join(plain, `${name}.tar`);
      writeTar(tar, [
        { name: MANIFEST, source: path.join(plain, MANIFEST) },
        { name: DUMP, source: dumpFile },
        ...files.map((file) => ({ name: `${FILES}/${file.path}`, source: path.join(plain, FILES, file.path) })),
      ]);
      const tarSha256 = sha256OfFile(tar);

      const archiveFile = `${name}.tar.gpg`;
      const archive = path.join(folder, archiveFile);
      print("Encrypting. gpg asks for the export's passphrase twice: use a new one, kept only in your password manager.");
      await encrypt(tar, archive);
      print("Checking the archive. gpg asks for the passphrase once more.");
      const decrypted = createHash("sha256");
      await decrypt(archive, async (output) => {
        for await (const chunk of output) decrypted.update(chunk as Buffer);
      });
      if (decrypted.digest("hex") !== tarSha256) throw new Error("The archive doesn't decrypt to what was encrypted. The export was not kept.");
      removePlain();

      const record: ExportRecord = { ...manifest, archive: { file: archiveFile, sha256: sha256OfFile(archive), bytes: statSync(archive).size } };
      writeJsonOnce(path.join(folder, MANIFEST), record);
      finished = true;

      const rows = Object.fromEntries(Object.entries(tables).map(([table, summary]) => [table, summary.rows]));
      logStep({ step: "export", result: "ok", export: name, counts: { tables: rows, files: files.length }, sha256: { archive: record.archive.sha256, dump: manifest.dump.sha256 } });
      print(`Export: ${folder}`);
      print(`Tables: ${Object.keys(rows).length}, rows: ${Object.values(rows).reduce((sum, count) => sum + count, 0)}; files: ${files.length}`);
      print(`Archive SHA256: ${record.archive.sha256}`);
      print(`Delete by: ${manifest.deleteBy} (${KEEP_DAYS} days after it was taken). Record that date in the cutover log.`);
      print(`Export: ok. The plain copies are removed. Next: rehearse ${target.environment}.`);
      return "ok";
    } finally {
      removePlain();
      if (!finished) rmSync(folder, { recursive: true, force: true });
    }
  },
};
