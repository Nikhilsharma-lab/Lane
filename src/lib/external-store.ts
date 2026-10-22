/**
 * A value outside React that components read with useSyncExternalStore: `get`
 * is the snapshot, `set` replaces it and tells every subscriber. Shared by the
 * shell's current Request and the Undo pointer (spec #101).
 */
export function createExternalStore<T>(initial: T) {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set: (next: T) => {
      value = next
      listeners.forEach(listener => listener())
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}
