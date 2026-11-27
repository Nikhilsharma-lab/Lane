// The step log (#410 "Step log"): one JSON line per step, appended to <working folder>/<environment>/steps.log,
// beside that environment's exports. UTC time, environment, step, result, counts and SHA256s, never a secret.
// The cutover log comment is written from it, and a session that broke resumes from its last line.
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Environment } from "./environments.mts";

export type StepResult = "ok" | "stop" | "failed";

export type StepLine = Readonly<{
  at: string;
  environment: Environment;
  step: string;
  result: StepResult;
  /** The environment a comparison ran against (schema-diff). */
  against?: Environment;
  /** The export the step took, rehearsed or compared against: its folder's name. */
  export?: string;
  counts?: Readonly<Record<string, unknown>>;
  sha256?: Readonly<Record<string, string>>;
  /** Why a step stopped or failed, in a sentence with no secret in it. */
  detail?: string;
}>;

export function stepLogFile(workingFolder: string, environment: Environment): string {
  return path.join(workingFolder, environment, "steps.log");
}

/** Appends one line. `redact` removes any secret the line could have picked up (an error's text, say). */
export function appendStep(workingFolder: string, line: Omit<StepLine, "at">, redact: (text: string) => string): StepLine {
  const entry: StepLine = { at: new Date().toISOString(), ...line };
  const file = stepLogFile(workingFolder, line.environment);
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  appendFileSync(file, `${redact(JSON.stringify(entry))}\n`, { mode: 0o600 });
  return entry;
}

/** Every line logged for an environment, oldest first. */
export function readSteps(workingFolder: string, environment: Environment): StepLine[] {
  let text: string;
  try {
    text = readFileSync(stepLogFile(workingFolder, environment), "utf8");
  } catch {
    return [];
  }
  return text.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as StepLine);
}

/** The last line logged for an environment, where a broken session resumes. */
export function lastStep(workingFolder: string, environment: Environment): StepLine | undefined {
  return readSteps(workingFolder, environment).at(-1);
}

export function describeStep(line: StepLine): string {
  return `${line.at} ${line.environment} ${line.step}${line.against ? ` against ${line.against}` : ""}: ${line.result}`;
}
