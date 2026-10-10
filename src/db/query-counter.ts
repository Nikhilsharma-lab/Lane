import { AsyncLocalStorage } from "node:async_hooks";

type Counter = { statements: number };

const storage = new AsyncLocalStorage<Counter>();

/**
 * Counts the SQL statements the shared client executes inside a measured
 * call, through drizzle's logger. The server budget (plan §2.2) is at most
 * two sequential round trips per page render and per mutation, and the
 * Vitest ceilings assert statement counts per action and loader with this.
 */
export const queryCounter = {
  async measure<T>(fn: () => Promise<T>): Promise<{ result: T; statements: number }> {
    const counter: Counter = { statements: 0 };
    // Drizzle queries run when they are awaited, so the await has to happen
    // inside the store, not after run() has returned the thenable.
    const result = await storage.run(counter, async () => await fn());
    return { result, statements: counter.statements };
  },
  /** Called by the database client for every statement; a no-op outside a measurement. */
  record() {
    const counter = storage.getStore();
    if (counter) counter.statements += 1;
  },
};
