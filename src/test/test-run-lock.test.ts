import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import ts from "typescript";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, expect, it } from "vitest";
import { resolveTestDatabase } from "./test-database";
import * as locks from "./test-run-lock";

const lockDirectory = mkdtempSync(path.join(tmpdir(), "lane-lock-test-"));
const target = resolveTestDatabase("postgresql://tester@localhost:5437/lane_test");
afterAll(() => rmSync(lockDirectory, { recursive: true, force: true }));

it("exclusively owns one server/port/database until its own release, including localhost aliases", () => {
  const first = locks.acquireTestRunLock(target, lockDirectory);
  expect(() => locks.acquireTestRunLock({ ...target, host: "127.0.0.1" }, lockDirectory)).toThrow(/already running/);
  first.release();
  const successor = locks.acquireTestRunLock(target, lockDirectory);
  first.release();
  expect(() => locks.acquireTestRunLock(target, lockDirectory)).toThrow(/already running/);
  successor.release();
});

// Node 20 CI cannot import TypeScript directly. Compile the real standalone lock
// module with the existing TypeScript dependency; child processes run that code.
const compiled = path.join(lockDirectory, "lock.mjs");
writeFileSync(compiled, ts.transpileModule(readFileSync(path.join(import.meta.dirname, "test-run-lock.ts"), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText);
const runner = path.join(lockDirectory, "runner.mjs");
writeFileSync(runner, `import { acquireTestRunLock } from './lock.mjs';
import { spawn } from 'node:child_process';
try {
  const lock = acquireTestRunLock(JSON.parse(process.argv[2]), process.argv[3]);
  process.send('owned');
  process.on('message', message => {
    if (message === 'worker') {
      const worker = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
      process.send(worker.pid);
    }
    if (message === 'exit') process.exit(0);
    if (message === 'fail') throw new Error('setup failed');
    if (message === 'release') { lock.release(); process.send('released'); }
  });
} catch (error) { process.send(error.message); process.exit(2); }
`);
const children = new Set<ChildProcess>();
afterEach(async () => {
  await Promise.all([...children].map(async child => {
    const alive = child.exitCode === null && child.signalCode === null;
    try { process.kill(-child.pid!, "SIGKILL"); } catch { /* Already gone. */ }
    if (alive) await once(child, "exit");
  }));
  children.clear();
});
async function owner(directory: string) {
  const child = spawn(process.execPath, [runner, JSON.stringify(target), directory], { detached: true, stdio: ["ignore", "pipe", "pipe", "ipc"] });
  children.add(child);
  const [message] = await once(child, "message");
  return { child, message };
}
function freshLocks() { return mkdtempSync(path.join(lockDirectory, "case-")); }

it("refuses a competing process and releases ownership at normal process exit", async () => {
  const directory = freshLocks();
  const first = await owner(directory);
  expect(first.message).toBe("owned");
  expect((await owner(directory)).message).toMatch(/already running/);
  first.child.send("exit");
  await once(first.child, "exit");
  const second = await owner(directory);
  expect(second.message).toBe("owned");
});

it("recovers a crashed owner only once when separate processes race", async () => {
  const directory = freshLocks();
  const first = await owner(directory);
  expect(first.message).toBe("owned");
  first.child.kill("SIGKILL");
  await once(first.child, "exit");
  const contenders = await Promise.all([owner(directory), owner(directory), owner(directory)]);
  expect(contenders.filter(result => result.message === "owned")).toHaveLength(1);
  expect(contenders.filter(result => /already running/.test(result.message))).toHaveLength(2);
});

it.each(["foreign-boot", "foreign-target", "missing-checkout", "missing-token", "malformed-token", "reused-pid", "malformed"])("leaves ambiguous %s ownership for manual recovery", async condition => {
  const directory = freshLocks();
  const first = await owner(directory);
  first.child.kill("SIGKILL");
  await once(first.child, "exit");
  const file = path.join(directory, readdirSync(directory).find(name => name.endsWith(".json"))!);
  const metadata = JSON.parse(readFileSync(file, "utf8"));
  if (condition === "foreign-boot") metadata.machine = "unrecognized-boot";
  if (condition === "foreign-target") metadata.database = "lane_test_other";
  if (condition === "missing-checkout") delete metadata.checkoutRoot;
  if (condition === "malformed-token") metadata.token = "-".repeat(36);
  if (condition === "missing-token") delete metadata.token;
  if (condition === "reused-pid") metadata.pid = process.pid;
  writeFileSync(file, condition === "malformed" ? "{" : JSON.stringify(metadata));
  const before = readFileSync(file, "utf8");
  expect((await owner(directory)).message).toMatch(/manual recovery/);
  expect(readFileSync(file, "utf8")).toBe(before);
});

it("releases when a process exits unsuccessfully", async () => {
  const directory = freshLocks();
  const first = await owner(directory);
  expect(first.message).toBe("owned");
  first.child.send("fail");
  const [code] = await once(first.child, "exit");
  expect(code).not.toBe(0);
  expect(readdirSync(directory)).toEqual([]);
  expect((await owner(directory)).message).toBe("owned");
});

it("does not recover an abandoned acquisition/recovery guard", async () => {
  const directory = freshLocks();
  const first = await owner(directory);
  expect(first.message).toBe("owned");
  first.child.kill("SIGKILL");
  await once(first.child, "exit");
  const file = readdirSync(directory).find(name => name.endsWith(".json"))!;
  mkdirSync(path.join(directory, file.replace(/\.json$/, ".guard")));
  expect((await owner(directory)).message).toMatch(/manual recovery/);
});

it.each(["crash", "exit"])("retains ownership after owner %s while an orphaned worker remains alive", async ending => {
  const directory = freshLocks();
  const first = await owner(directory);
  expect(first.message).toBe("owned");
  first.child.send("worker");
  const [workerPid] = await once(first.child, "message");
  expect(typeof workerPid).toBe("number");
  if (ending === "crash") first.child.kill("SIGKILL");
  else first.child.send("exit");
  await once(first.child, "exit");
  expect((await owner(directory)).message).toMatch(/manual recovery/);
});
