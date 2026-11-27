// Lane's cutover kit (#410): one subcommand per runbook step, run from the repository root:
//
//   node scripts/cutover/kit.mts <subcommand> <staging|production|rehearsal> [options]
//
// Options: --dir <folder> is the working folder for step logs and exports (default backups/better-auth-cutover,
// git-ignored); --folder <lane_rehearsal_… folder> is the local folder standing in for request-attachments in a
// rehearsal. Every secret is copied to the clipboard when the kit asks, never typed or passed as an argument; the
// export's passphrase is the one exception, which gpg asks for itself.
//
// Exit codes: 0 ok; 1 stop (the runbook doesn't go on) or failed; 2 refused or misused, with nothing touched.
import { mkdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { folderBucket, supabaseBucket } from "./bucket.mts";
import type { Command, Target } from "./command.mts";
import { apply } from "./commands/apply.mts";
import { checkBlanks } from "./commands/check-blanks.mts";
import { checkWrites } from "./commands/check-writes.mts";
import { checkZero } from "./commands/check-zero.mts";
import { emptyBucketCommand } from "./commands/empty-bucket.mts";
import { empty } from "./commands/empty.mts";
import { exportCommand } from "./commands/export.mts";
import { rehearse } from "./commands/rehearse.mts";
import { restore } from "./commands/restore.mts";
import { schemaDiff } from "./commands/schema-diff.mts";
import { state } from "./commands/state.mts";
import {
  databaseTarget,
  ENVIRONMENT_NAMES,
  isEnvironment,
  localServer,
  PROJECT_REFS,
  Refusal,
  rehearsalFolder,
  storageKey,
  type DatabaseTarget,
  type Environment,
} from "./environments.mts";
import { SecretSession, systemClipboard } from "./secrets.mts";
import { appendStep, describeStep, lastStep } from "./step-log.mts";

export const COMMANDS: readonly Command[] = [state, schemaDiff, exportCommand, rehearse, apply, checkWrites, empty, emptyBucketCommand, checkZero, checkBlanks, restore];
const DEFAULT_WORKING_FOLDER = path.resolve(import.meta.dirname, "../../backups/better-auth-cutover");
const FLAGS = ["--dir", "--folder"] as const;

type Invocation = Readonly<{ command: Command; environments: Environment[]; flags: Partial<Record<(typeof FLAGS)[number], string>> }>;

function usage(): string {
  return ["Usage: node scripts/cutover/kit.mts <subcommand> <environment> [options]", ...COMMANDS.map((command) => `  ${command.usage}`)].join("\n");
}

function parse(argv: string[]): Invocation {
  const positional: string[] = [];
  const flags: Invocation["flags"] = {};
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (!argument.startsWith("--")) positional.push(argument);
    else if ((FLAGS as readonly string[]).includes(argument) && argv[index + 1] !== undefined) flags[argument as (typeof FLAGS)[number]] = argv[++index];
    else throw new Refusal(`Unknown option ${argument}.\n${usage()}`);
  }
  const [name, ...environments] = positional;
  const command = COMMANDS.find((candidate) => candidate.name === name);
  if (!command) throw new Refusal(usage());
  if (environments.length !== command.environments || !environments.every(isEnvironment)) {
    throw new Refusal(`${command.name} names ${command.environments === 1 ? "one environment" : "two environments"}: staging, production or rehearsal.\n  ${command.usage}`);
  }
  if (flags["--folder"] && !(command.bucket && environments[0] === "rehearsal")) {
    throw new Refusal("--folder is only for a rehearsal's bucket. Nothing was done.");
  }
  return { command, environments: environments as Environment[], flags };
}

function databaseLabel(environment: Environment, label: string): string {
  if (environment === "rehearsal") return `the connection string of the local ${label} database (lane_rehearsal_…)`;
  return `${ENVIRONMENT_NAMES[environment]}'s database connection string (Supabase → ${PROJECT_REFS[environment]} → Connect → Session pooler, password filled in)`;
}

const LOCAL_SERVER_LABEL = "the connection string of your local Postgres server, for the throwaway copy (postgresql://<you>@127.0.0.1:5432/postgres)";

/** Checks every target and takes every secret, refusing before anything is touched. */
async function resolveTargets(invocation: Invocation, session: SecretSession): Promise<{ targets: Target[]; localServer?: DatabaseTarget }> {
  const { command, environments, flags } = invocation;
  if (command.connects === "local server") {
    const server = localServer(await session.ask(LOCAL_SERVER_LABEL));
    // One pgpass line for every database on that server: the throwaway copies are made there.
    session.holdDatabase({ ...server, database: "*" });
    return { targets: [], localServer: server };
  }
  const labels = environments.map((environment, index) =>
    environments.indexOf(environment) !== environments.lastIndexOf(environment) ? `${environment} ${index + 1}` : environment);
  // The folder isn't secret, so it's checked before anything is asked for.
  const folder = command.bucket && environments[0] === "rehearsal" ? rehearsalFolder(flags["--folder"]) : undefined;
  const targets: Target[] = [];
  for (const [index, environment] of environments.entries()) {
    const database = databaseTarget(environment, await session.ask(databaseLabel(environment, labels[index])));
    session.holdDatabase(database);
    let bucket;
    if (command.bucket) {
      if (environment === "rehearsal") bucket = folderBucket(folder!);
      else {
        const label = `${ENVIRONMENT_NAMES[environment]}'s Supabase secret key (Supabase → ${PROJECT_REFS[environment]} → Project Settings → API Keys)`;
        bucket = supabaseBucket(PROJECT_REFS[environment], storageKey(environment, await session.ask(label)));
      }
    }
    targets.push({ environment, label: labels[index], database, bucket });
  }
  return { targets };
}

export async function main(argv: string[]): Promise<number> {
  let session: SecretSession | undefined;
  const undos: (() => void)[] = [];
  // What a subcommand registered to undo (a throwaway database, a plain copy), newest first, then the secret file.
  const cleanUp = () => {
    for (const undo of undos.splice(0).reverse()) {
      try {
        undo();
      } catch {}
    }
    session?.close();
  };
  const say = (stream: NodeJS.WriteStream, text: string) => stream.write(`${session ? session.redact(text) : text}\n`);
  const closeAndExit = (signal: NodeJS.Signals) => {
    cleanUp();
    say(process.stderr, `Stopped by ${signal}. The secret file and anything plain the step held are deleted. Rerun the step to carry on.`);
    process.exit(130);
  };
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.once(signal, closeAndExit);
  process.once("exit", cleanUp);

  let invocation: Invocation | undefined;
  let resolved = false;
  try {
    invocation = parse(argv);
    const workingFolder = path.resolve(invocation.flags["--dir"] ?? DEFAULT_WORKING_FOLDER);
    session = new SecretSession(workingFolder, systemClipboard());
    for (const environment of new Set(invocation.environments)) {
      const last = lastStep(workingFolder, environment);
      say(process.stdout, last ? `Last logged step: ${describeStep(last)}` : `No step logged yet for ${environment}.`);
    }
    const { targets, localServer: server } = await resolveTargets(invocation, session);
    session.stopAsking();
    resolved = true;
    const activeSession = session;
    const [environment, against] = invocation.environments;
    mkdirSync(activeSession.folder, { recursive: true, mode: 0o700 });
    const result = await invocation.command.run({
      environment,
      targets,
      localServer: server,
      workingFolder,
      pgpassFile: activeSession.pgpassFile,
      privateFolder: activeSession.folder,
      atExit: (undo) => void undos.push(undo),
      print: (line) => say(process.stdout, line),
      logStep: (line) => appendStep(workingFolder, { environment, ...(against ? { against } : {}), ...line }, (text) => activeSession.redact(text)),
    });
    return result === "ok" ? 0 : 1;
  } catch (error) {
    if (error instanceof Refusal) {
      say(process.stderr, error.message);
      return 2;
    }
    const message = error instanceof Error ? error.message : String(error);
    say(process.stderr, `FAILED: ${message}`);
    if (resolved && invocation && session) {
      const activeSession = session;
      const [environment, against] = invocation.environments;
      appendStep(
        path.resolve(invocation.flags["--dir"] ?? DEFAULT_WORKING_FOLDER),
        { environment, step: invocation.command.name, result: "failed", detail: message, ...(against ? { against } : {}) },
        (text) => activeSession.redact(text),
      );
    }
    return 1;
  } finally {
    cleanUp();
  }
}

const invokedDirectly = process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (invokedDirectly) process.exitCode = await main(process.argv.slice(2));
