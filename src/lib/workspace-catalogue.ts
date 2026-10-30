import { useState, useSyncExternalStore } from "react";
import { thrownMessage } from "./failure-messages";

type ReadResult<Entry, Metadata> = { success: true; entries: Entry[]; metadata: Metadata } | { success: false; error: string };
export type CatalogueSnapshot<Entry, Metadata> = {
  entries: Entry[]; metadata: Metadata; loading: boolean; error: string | null;
  add: (entry: Entry) => void; reload: () => Promise<void>;
};

/** In-process ownership for the workspace's two seeded catalogues. */
export function createWorkspaceCatalogue<Entry extends { id: string }, Metadata>(options: {
  initial: { entries: Entry[]; metadata: Metadata };
  read: () => Promise<ReadResult<Entry, Metadata>>;
  loadError: string;
  arrange?: (entries: Entry[]) => Entry[];
  clearErrorOnChange?: boolean;
}) {
  let sequence = 0, generation = 0;
  let active = true;
  const additions = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  function publish(patch: Partial<CatalogueSnapshot<Entry, Metadata>>) {
    snapshot = { ...snapshot, error: options.clearErrorOnChange ? null : snapshot.error, ...patch };
    listeners.forEach(listener => listener());
  }
  function merge(entries: Entry[]) {
    const combined = [...entries.filter(entry => !additions.has(entry.id)), ...additions.values()];
    return options.arrange?.(combined) ?? combined;
  }
  async function reload(lifetime: number) {
    if (!active || lifetime !== generation) return;
    const request = ++sequence;
    publish({ loading: true });
    let result: ReadResult<Entry, Metadata>;
    try { result = await options.read(); }
    // #260: offline says the shared offline answer; any other throw says loadError, never the raw text.
    catch (thrown) { result = { success: false, error: thrownMessage(thrown, options.loadError) }; }
    if (!active || lifetime !== generation || request !== sequence) return;
    if (result.success) for (const entry of result.entries) additions.delete(entry.id);
    publish({ loading: false, ...(result.success
      ? { entries: merge(result.entries), metadata: result.metadata, error: null }
      : { error: result.error }) });
  }

  function add(entry: Entry, lifetime: number) {
    if (!active || lifetime !== generation) return;
    additions.delete(entry.id);
    additions.set(entry.id, entry);
    publish({ entries: merge(snapshot.entries) });
  }
  function seed(lifetime: number): CatalogueSnapshot<Entry, Metadata> {
    return { ...options.initial, error: null, loading: false, add: entry => add(entry, lifetime), reload: () => reload(lifetime) };
  }
  let snapshot = seed(generation);
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      active = true;
      listeners.add(listener);
      return () => {
        if (listeners.delete(listener) && !listeners.size) {
          active = false;
          generation++;
          additions.clear();
          // Cleanup/setup can reconnect; old creation callbacks stay invalid.
          snapshot = seed(generation);
        }
      };
    },
  };
}

/** Keep the seeded owner and its subscription together for each keyed provider. */
export function useWorkspaceCatalogue<Entry extends { id: string }, Metadata>(create: () => ReturnType<typeof createWorkspaceCatalogue<Entry, Metadata>>) {
  const [catalogue] = useState(create);
  return useSyncExternalStore(catalogue.subscribe, catalogue.getSnapshot, catalogue.getSnapshot);
}
