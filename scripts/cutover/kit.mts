// Lane's cutover kit (#410): one subcommand per runbook step, run from the repository root:
//
//   node scripts/cutover/kit.mts <subcommand> <staging|production|rehearsal> [options]
//
// Options: --dir <folder> is the working folder for step logs and exports (default backups/better-auth-cutover,
// git-ignored); --folder <lane_rehearsal_… folder> is the local folder standing in for request-attachments in a
// rehearsal. Every secret is copied to the clipboard when the kit asks, never typed or passed as an argument.
//
// Exit codes: 0 ok; 1 stop (the runbook doesn't go on) or failed; 2 refused or misused, with nothing touched.
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { folderBucket, supabaseBucket } from "./bucket.mts";
import type { Command, Target } from "./command.mts";
import { checkBlanks } from "./commands/check-blanks.mts";
import { schemaDiff } from "./commands/schema-diff.mts";
import { state } from "./commands/state.mts";
import {
  databaseTarget,
  ENVIRONMENT_NAMES,
  isEnvironment,
  PROJECT_REFS,
  Refusal,
  rehearsalFolder,
  storageKey,
  type Environment,
} from "./environments.mts";
import { SecretSession, systemClipboard } from "./secrets.mts";
import { appendStep, describeStep, lastStep } from "./step-log.mts";

export const COMMANDS: readonly Command[] = [state, schemaDiff, checkBlanks];
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

/** Checks every target and takes every secret, refusing before anything is touched. */
async function resolveTargets(invocation: Invocation, session: SecretSession): Promise<Target[]> {
  const { command, environments, flags } = invocation;
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
  return targets;
}

export async function main(argv: string[]): Promise<number> {
  let session: SecretSession | undefined;
  const say = (stream: NodeJS.WriteStream, text: string) => stream.write(`${session ? session.redact(text) : text}\n`);
  const closeAndExit = (signal: NodeJS.Signals) => {
    session?.close();
    say(process.stderr, `Stopped by ${signal}. The secret file is deleted. Rerun the step to carry on.`);
    process.exit(130);
  };
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.once(signal, closeAndExit);
  process.once("exit", () => session?.close());

  let targets: Target[] | undefined;
  let invocation: Invocation | undefined;
  try {
    invocation = parse(argv);
    const workingFolder = path.resolve(invocation.flags["--dir"] ?? DEFAULT_WORKING_FOLDER);
    session = new SecretSession(workingFolder, systemClipboard());
    for (const environment of new Set(invocation.environments)) {
      const last = lastStep(workingFolder, environment);
      say(process.stdout, last ? `Last logged step: ${describeStep(last)}` : `No step logged yet for ${environment}.`);
    }
    targets = await resolveTargets(invocation, session);
    const activeSession = session;
    const [first, second] = targets;
    const result = await invocation.command.run({
      targets,
      workingFolder,
      pgpassFile: activeSession.pgpassFile,
      print: (line) => say(process.stdout, line),
      logStep: (line) => appendStep(workingFolder, { environment: first.environment, ...(second ? { against: second.environment } : {}), ...line }, (text) => activeSession.redact(text)),
    });
    return result === "ok" ? 0 : 1;
  } catch (error) {
    if (error instanceof Refusal) {
      say(process.stderr, error.message);
      return 2;
    }
    const message = error instanceof Error ? error.message : String(error);
    say(process.stderr, `FAILED: ${message}`);
    if (targets && invocation && session) {
      const activeSession = session;
      appendStep(
        path.resolve(invocation.flags["--dir"] ?? DEFAULT_WORKING_FOLDER),
        { environment: targets[0].environment, step: invocation.command.name, result: "failed", detail: message, ...(targets[1] ? { against: targets[1].environment } : {}) },
        (text) => activeSession.redact(text),
      );
    }
    return 1;
  } finally {
    session?.close();
  }
}

const invokedDirectly = process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (invokedDirectly) process.exitCode = await main(process.argv.slice(2));
