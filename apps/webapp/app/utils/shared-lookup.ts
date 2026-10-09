/**
 * A small shared cache for per-asset lookups shown on many rows at once —
 * sales, labels, attachment counts. Not in upstream Shelf.
 *
 * One request serves every row, the data outlives the list that asked for it
 * (so switching between simple and advanced view keeps it), and `refresh()`
 * reloads it after something changes.
 */
import { useEffect, useSyncExternalStore } from "react";

type Listener = () => void;

export function createSharedLookup<T>(url: string, ttlMs = 5_000) {
  let data: T | null = null;
  let loadedAt = 0;
  let inFlight: Promise<void> | null = null;
  const listeners = new Set<Listener>();

  const notify = () => listeners.forEach((l) => l());

  const load = () => {
    if (inFlight) return inFlight;
    inFlight = fetch(url, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json) {
          data = json as T;
          loadedAt = Date.now();
          notify();
        }
      })
      .catch(() => {})
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };

  const subscribe = (listener: Listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const getSnapshot = () => data;
  const getServerSnapshot = () => null;

  return {
    /** The shared data (null until loaded). Loads it if missing or stale. */
    useData(): T | null {
      const snapshot = useSyncExternalStore(
        subscribe,
        getSnapshot,
        getServerSnapshot
      );
      useEffect(() => {
        if (!data || Date.now() - loadedAt > ttlMs) void load();
      }, []);
      return snapshot;
    },
    /** Reload now, e.g. after marking something sold. */
    refresh() {
      loadedAt = 0;
      // A refresh asked for while a load is in flight must not be lost: it
      // runs again once that load finishes, so it sees anything newer.
      if (inFlight) return inFlight.then(() => load());
      return load();
    },
    /** The current data without subscribing (for polling loops). */
    peek(): T | null {
      return data;
    },
  };
}
