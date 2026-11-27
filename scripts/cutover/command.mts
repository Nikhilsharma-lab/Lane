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
  /** The first environment named: whose step log the subcommand writes, and whose exports it reads. */
  environment: Environment;
  /** Every named environment's database (and bucket), checked. Empty for a subcommand that connects to the local server. */
  targets: readonly Target[];
  /** The local Postgres server, for a subcommand that makes throwaway copies there (`connects: "local server"`). */
  localServer?: DatabaseTarget;
  /** The kit's working folder (default backups/better-auth-cutover): step logs and exports live here. */
  workingFolder: string;
  /** The owner-only pgpass file holding every target database's credentials, for pg_dump, pg_restore and psql. */
  pgpassFile: string;
  /**
   * This run's owner-only folder (0700), beside the pgpass file, for anything plain a step must hold for a moment:
   * an export before it's encrypted, a decrypted rehearsal. The kit deletes it when it exits, however it exits.
   */
  privateFolder: string;
  /** Registers something to undo synchronously if the kit exits before the subcommand does (a signal, an exit). */
  atExit: (undo: () => void) => void;
  /** Prints a line on stdout, with any secret removed. */
  print: (line: string) => void;
  /** Appends a line to the first environment's step log. */
  logStep: (line: Omit<StepLine, "at" | "environment">) => void;
}>;

export type Command = Readonly<{
  name: string;
  usage: string;
  /** How many environments the subcommand names: one, or two to compare. */
  environments: 1 | 2;
  /** Whether it reaches the bucket (and so needs the storage key, or --folder for a rehearsal). */
  bucket: boolean;
  /**
   * What the kit asks for: each named environment's database (the default), or only the local Postgres server, for
   * a subcommand that works on throwaway copies of an environment's export and never reaches the environment.
   */
  connects?: "environments" | "local server";
  /** "ok" exits 0; "stop" exits 1 and means the runbook doesn't go on. */
  run: (context: CommandContext) => Promise<Exclude<StepResult, "failed">>;
}>;
