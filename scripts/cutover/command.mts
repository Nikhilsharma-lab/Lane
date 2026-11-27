// What a kit subcommand is. The kit resolves and checks every target, takes every secret and only then runs the
// subcommand, so a subcommand never sees an unchecked target, a raw connection string or a key.
import type { Bucket } from "./bucket.mts";
import type { DatabaseTarget, Environment } from "./environments.mts";
import type { StepLine, StepResult } from "./step-log.mts";

export type Target = Readonly<{
  environment: Environment;
  /** How the terminal names it: "staging", or "rehearsal 2" when one subcommand compares two rehearsals. */
  label: string;
  database: DatabaseTarget;
  /** Present when the subcommand asks for the bucket. */
  bucket?: Bucket;
}>;

export type CommandContext = Readonly<{
  targets: readonly Target[];
  /** The kit's working folder (default backups/better-auth-cutover): step logs, and later exports, live here. */
  workingFolder: string;
  /** The owner-only pgpass file holding every target database's credentials, for pg_dump, pg_restore and psql. */
  pgpassFile: string;
  /** Prints a line on stdout, with any secret removed. */
  print: (line: string) => void;
  /** Appends a line to the first target's step log. */
  logStep: (line: Omit<StepLine, "at" | "environment">) => void;
}>;

export type Command = Readonly<{
  name: string;
  usage: string;
  /** How many environments the subcommand names: one, or two to compare. */
  environments: 1 | 2;
  /** Whether it reaches the bucket (and so needs the storage key, or --folder for a rehearsal). */
  bucket: boolean;
  /** "ok" exits 0; "stop" exits 1 and means the runbook doesn't go on. */
  run: (context: CommandContext) => Promise<Exclude<StepResult, "failed">>;
}>;
