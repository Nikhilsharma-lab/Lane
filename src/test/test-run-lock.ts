import { execFileSync, spawnSync } from "node:child_process";
import { hostname } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { TestDatabaseTarget } from "./test-database";

function machineIdentity(): string {
  try {
    const boot = process.platform === "linux"
      ? readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim()
      : process.platform === "darwin"
        ? execFileSync("/usr/sbin/sysctl", ["-n", "kern.boottime"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
        : "";
    if (!boot) throw new Error();
    return `${hostname()}:${boot}`;
  } catch {
    throw new Error("[test-lock] Cannot establish machine/boot identity; refusing ownership. See docs/operations/local-test-databases.md.");
  }
}

function processGroupForOwner(): number {
  const group = Number(execFileSync("/bin/ps", ["-o", "pgid=", "-p", String(process.pid)], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }).trim());
  if (!Number.isSafeInteger(group) || group <= 0) throw new Error("[test-lock] Cannot identify the runner process group; refusing ownership.");
  return group;
}

function processIsAbsent(pid: number): boolean {
  try { process.kill(pid, 0); return false; }
  catch (error) { return (error as NodeJS.ErrnoException).code === "ESRCH"; }
}

function groupHasOtherProcesses(group: number): boolean {
  // Exclude only this runner and the exact ps subprocess used for inspection.
  const result = spawnSync("/bin/ps", ["-axo", "pid=,pgid="], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) throw new Error("[test-lock] Cannot inspect the runner process group.");
  const members = result.stdout.trim().split("\n").map(line => line.trim().split(/\s+/).map(Number));
  // Missing self is also uncertainty, never proof that the group is empty.
  return !members.some(([pid, pgid]) => pgid === group && pid === process.pid) ||
    members.some(([pid, pgid]) => pgid === group && pid !== process.pid && pid !== result.pid);
}

function ownerHasEnded(owner: unknown, machine: string, target: TestDatabaseTarget): boolean {
  if (!owner || typeof owner !== "object") return false;
  const value = owner as Record<string, unknown>;
  if (value.machine !== machine || value.database !== target.database ||
    value.port !== target.port || value.checkoutRoot !== target.checkoutRoot ||
    typeof value.token !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.token) ||
    !Number.isSafeInteger(value.pid) || Number(value.pid) <= 0 ||
    !Number.isSafeInteger(value.group) || Number(value.group) <= 0) return false;
  // A dead runner can leave database-using Vitest workers or psql alive. Their
  // inherited process group must also be gone; an occupied/reused group is ambiguous.
  return processIsAbsent(Number(value.pid)) && processIsAbsent(-Number(value.group));
}

// A machine-wide path also fails closed for another OS user who cannot read it.
// Per-user directories would let different users reset the same server/database.
const LOCK_DIRECTORY = "/tmp/lane-test-run-locks";

export function acquireTestRunLock(target: TestDatabaseTarget, directory = LOCK_DIRECTORY) {
  // Both allowed loopback spellings address the same local server. Credentials
  // do not distinguish owners of the same database.
  const key = createHash("sha256").update(`loopback:${target.port}/${target.database}`).digest("hex");
  const file = path.join(directory, `${key}.json`);
  const gate = path.join(directory, `${key}.guard`);
  const token = randomUUID();
  const machine = machineIdentity();
  const group = processGroupForOwner();
  const busy = () => new Error(`[test-lock] ${target.database} is already running or ownership is uncertain. Inspect ${file} and ${gate}; see docs/operations/local-test-databases.md for manual recovery. No reset was started.`);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const exclusive = (operation: () => void) => {
    try { mkdirSync(gate, { mode: 0o700 }); } catch { throw busy(); }
    try { operation(); } finally { rmdirSync(gate); }
  };
  exclusive(() => {
    try {
      const owner: unknown = JSON.parse(readFileSync(file, "utf8"));
      if (!ownerHasEnded(owner, machine, target)) throw busy();
      unlinkSync(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw busy();
    }
    writeFileSync(file, JSON.stringify({ token, pid: process.pid, group, machine, database: target.database, port: target.port, checkoutRoot: target.checkoutRoot }), { flag: "wx", mode: 0o600 });
  });
  const release = () => {
    exclusive(() => {
      try {
        if (JSON.parse(readFileSync(file, "utf8")).token === token) unlinkSync(file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw busy();
      }
    });
    process.off("exit", onExit);
  };
  const onExit = () => {
    try {
      // Explicit Vitest teardown releases after its workers finish. Unexpected
      // process exit must retain the record if other group members may continue.
      if (!groupHasOtherProcesses(group)) release();
    } catch { /* Leave uncertain metadata for explicit recovery. */ }
  };
  process.once("exit", onExit);
  return { release };
}
