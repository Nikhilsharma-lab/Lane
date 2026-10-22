import { describe, expect, it, vi } from "vitest"
import { createExternalStore } from "./external-store"

describe("createExternalStore", () => {
  it("hands out the latest value and tells subscribers until they leave", () => {
    const store = createExternalStore(1)
    const listener = vi.fn()
    const leave = store.subscribe(listener)
    store.set(2)
    expect(store.get()).toBe(2)
    expect(listener).toHaveBeenCalledOnce()
    leave()
    store.set(3)
    expect(listener).toHaveBeenCalledOnce()
  })
})
