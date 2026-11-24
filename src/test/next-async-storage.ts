/**
 * #389: Next keeps each request's cookies and headers in Node's AsyncLocalStorage, which its server puts on
 * globalThis before any of its modules load; without it they load with a stand-in that can hold no request. A test
 * file's imports load them first, so this runs as a setup file. It changes nothing for a test that runs outside a
 * request: there is still no store, and `cookies()`, `headers()` and `after()` still throw.
 */
import { AsyncLocalStorage } from "node:async_hooks"

const scope = globalThis as { AsyncLocalStorage?: unknown }
scope.AsyncLocalStorage ??= AsyncLocalStorage
