/**
 * #389: Next's request scope for one Server Action call, so server code under test reads the request's cookies and
 * headers through Next's own `cookies()` and `headers()`, Lane's and Better Auth's alike. A test calls it through
 * `AuthBrowser.action` (auth-route-browser.ts).
 *
 * The two stores and the request store's maker are Next's internals: after a Next upgrade, check these three paths
 * still exist. `revalidatePath` and `revalidateTag` are accepted and do nothing; `after()` work runs once the action
 * has answered.
 */
import { workAsyncStorage, type WorkStore } from "next/dist/server/app-render/work-async-storage.external"
import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external"
import { createRequestStoreForAPI } from "next/dist/server/async-storage/request-store"
import { NextRequest } from "next/server"

type AfterTask = Promise<unknown> | (() => unknown)
type Implicit = Parameters<typeof createRequestStoreForAPI>[2]
type Preview = Parameters<typeof createRequestStoreForAPI>[4]

/** `result` answers what the action returned, or throws what it threw; `setCookies` are the cookies it wrote. */
export async function asServerAction<T>(url: string, headers: Headers, run: () => Promise<T>): Promise<{ result: () => T; setCookies: string[] }> {
  const request = new NextRequest(url, { method: "POST", headers })
  let setCookies: string[] = []
  const afterTasks: AfterTask[] = []
  const work = {
    page: "/page",
    route: "/",
    incrementalCache: {},
    afterContext: { after: (task: AfterTask) => void afterTasks.push(task) },
  } as unknown as WorkStore
  const store = createRequestStoreForAPI(request, request.nextUrl, { tags: [] } as unknown as Implicit, (cookies) => (setCookies = cookies), undefined as unknown as Preview, undefined)

  const result = await workAsyncStorage.run(work, () =>
    workUnitAsyncStorage.run(store, async () => {
      const answer = await run().then(
        (value) => () => value,
        (thrown: unknown) => () => {
          throw thrown
        },
      )
      for (const task of afterTasks) await (typeof task === "function" ? task() : task)
      return answer
    }),
  )
  return { result, setCookies }
}
