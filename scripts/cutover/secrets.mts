// How secrets reach the kit, as the 0035–0053 release kit took them (#410 "Targets"): Nikhil copies one, presses
// Enter, the kit reads the clipboard and clears it at once. Database credentials go into an owner-only pgpass file
// (for pg_dump, pg_restore and psql), deleted when the kit exits. Nothing secret is printed, logged or kept anywhere
// else: every line the kit prints or logs passes through `redact` first.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface, type Interface } from "node:readline";
import { Refusal, type DatabaseTarget } from "./environments.mts";

export type Clipboard = Readonly<{ paste: () => string; clear: () => void }>;

/**
 * macOS's clipboard. `LANE_CUTOVER_CLIPBOARD` names a file that stands in for it, for the kit's own tests: reading
 * the file is the paste, emptying it is the clear.
 */
export function systemClipboard(env: NodeJS.ProcessEnv = process.env): Clipboard {
  const standIn = env.LANE_CUTOVER_CLIPBOARD;
  if (standIn) return { paste: () => readFileSync(standIn, "utf8"), clear: () => writeFileSync(standIn, "") };
  return {
    paste: () => {
      try {
        return execFileSync("pbpaste", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      } catch {
        throw new Refusal("The kit reads secrets from the macOS clipboard (pbpaste), which isn't available here. Nothing was done.");
      }
    },
    clear: () => execFileSync("pbcopy", { input: "", stdio: ["pipe", "ignore", "ignore"] }),
  };
}

const SECRETS_PREFIX = ".secrets-";
const SHORTEST_REDACTED = 6;

function pgpassField(value: string): string {
  return value.replace(/[\\:]/g, (character) => `\\${character}`);
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** One kit run's secrets: what was pasted (to redact it), and the owner-only file holding database credentials. */
export class SecretSession {
  readonly folder: string;
  private readonly held = new Set<string>();
  private lines?: AsyncIterator<string>;
  private reader?: Interface;
  private readonly clipboard: Clipboard;
  private readonly input: NodeJS.ReadableStream;
  private readonly prompt: (text: string) => void;

  constructor(
    workingFolder: string,
    clipboard: Clipboard,
    input: NodeJS.ReadableStream = process.stdin,
    prompt: (text: string) => void = (text) => process.stderr.write(text),
  ) {
    this.clipboard = clipboard;
    this.input = input;
    this.prompt = prompt;
    // A session the machine killed outright couldn't delete its file; the next run does.
    for (const entry of safeReaddir(workingFolder)) {
      const pid = Number(entry.slice(SECRETS_PREFIX.length).split("-")[0]);
      if (entry.startsWith(SECRETS_PREFIX) && !alive(pid)) rmSync(path.join(workingFolder, entry), { recursive: true, force: true });
    }
    this.folder = path.join(workingFolder, `${SECRETS_PREFIX}${process.pid}-${randomBytes(4).toString("hex")}`);
  }

  /** The owner-only file pg_dump, pg_restore and psql read credentials from (PGPASSFILE). */
  get pgpassFile(): string {
    return path.join(this.folder, "pgpass");
  }

  /** Asks Nikhil to copy `label`, waits for Enter, reads the clipboard and clears it. */
  async ask(label: string): Promise<string> {
    this.prompt(`Copy ${label} to the clipboard, then press Enter.\n`);
    this.reader ??= createInterface({ input: this.input, terminal: false });
    this.lines ??= this.reader[Symbol.asyncIterator]();
    const line = await this.lines.next();
    if (line.done) throw new Refusal("The kit's input closed before anything was copied. Nothing was done.");
    const value = this.clipboard.paste();
    this.clipboard.clear();
    this.hold(value);
    return value;
  }

  /** Remembers a secret so nothing the kit prints or logs can contain it. */
  hold(value: string): void {
    for (const form of [value, value.trim()]) if (form.length >= SHORTEST_REDACTED) this.held.add(form);
  }

  /** Writes a database's credentials to the owner-only file, and remembers its password. */
  holdDatabase(target: DatabaseTarget): void {
    this.hold(target.password);
    this.hold(encodeURIComponent(target.password));
    mkdirSync(this.folder, { recursive: true, mode: 0o700 });
    const line = [target.host, String(target.port), target.database, target.user, target.password].map(pgpassField).join(":");
    appendFileSync(this.pgpassFile, `${line}\n`, { mode: 0o600 });
  }

  redact(text: string): string {
    let out = text;
    for (const secret of [...this.held].sort((a, b) => b.length - a.length)) out = out.split(secret).join("[secret]");
    return out;
  }

  /** Deletes the owner-only file and stops reading input. Safe to call more than once. */
  close(): void {
    rmSync(this.folder, { recursive: true, force: true });
    this.reader?.close();
    if (this.reader) (this.input as NodeJS.ReadableStream & { destroy?: () => void }).destroy?.();
  }
}

function safeReaddir(folder: string): string[] {
  try {
    return readdirSync(folder);
  } catch {
    return [];
  }
}
