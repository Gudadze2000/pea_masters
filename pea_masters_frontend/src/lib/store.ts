import { useSyncExternalStore } from "react"

export type Store<T> = {
  get: () => T
  set: (next: T) => void
  subscribe: (listener: () => void) => () => void
}

/** A value shared by every component that reads it, e.g. saved profile data shown both in the editor and in the preview. */
export function createStore<T>(initial: T): Store<T> {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set(next) {
      value = next
      listeners.forEach(listener => listener())
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}

/**
 * Reads a store and re-renders when it changes. A plain `useX` function on purpose: the React Compiler treats a
 * method called `.use()` as React's `use()` API, which breaks the order of hooks.
 */
export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}
