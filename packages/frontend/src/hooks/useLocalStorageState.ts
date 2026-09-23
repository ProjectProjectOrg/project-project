import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import { useCallback, useMemo, useRef, useSyncExternalStore } from "react"

type Snapshot = { readonly raw: string | null; readonly value: unknown }

const snapshots = new Map<string, Snapshot>()
const listeners = new Map<string, Set<() => void>>()

function readRaw(key: string): string | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function decode<
  S extends Schema.ConstraintDecoder<unknown> &
    Schema.ConstraintEncoder<unknown>
>(raw: string | null, schema: S, initial: S["Type"]): S["Type"] {
  if (raw === null) return initial
  const decoded = Schema.decodeResult(Schema.fromJsonString(schema))(raw)
  return Result.isSuccess(decoded) ? decoded.success : initial
}

function snapshot<
  S extends Schema.ConstraintDecoder<unknown> &
    Schema.ConstraintEncoder<unknown>
>(key: string, schema: S, initial: S["Type"]): S["Type"] {
  const raw = readRaw(key)
  const cached = snapshots.get(key)
  if (cached !== undefined && cached.raw === raw)
    return cached.value as S["Type"]
  const value = decode(raw, schema, initial)
  snapshots.set(key, { raw, value })
  return value
}

function notify(key: string): void {
  const set = listeners.get(key)
  if (set) for (const listener of set) listener()
}

let windowListenerAttached = false

function attachWindowListener(): void {
  if (windowListenerAttached || typeof window === "undefined") return
  windowListenerAttached = true
  window.addEventListener("storage", (event) => {
    if (event.key === null) {
      snapshots.clear()
      for (const key of listeners.keys()) notify(key)
      return
    }
    snapshots.delete(event.key)
    notify(event.key)
  })
}

function subscribeLocalStorage(
  key: string,
  onStoreChange: () => void
): () => void {
  attachWindowListener()
  let set = listeners.get(key)
  if (!set) {
    set = new Set()
    listeners.set(key, set)
  }
  set.add(onStoreChange)
  return () => {
    set.delete(onStoreChange)
    if (set.size === 0) listeners.delete(key)
  }
}

function setLocalStorageSnapshot<
  S extends Schema.ConstraintDecoder<unknown> &
    Schema.ConstraintEncoder<unknown>
>(key: string, schema: S, next: S["Type"]): void {
  if (typeof window !== "undefined") {
    try {
      const encoded = Schema.encodeSync(Schema.fromJsonString(schema))(next)
      window.localStorage.setItem(key, encoded)
    } catch {
      return
    }
  }
  snapshots.delete(key)
  notify(key)
}

export function useLocalStorageSelect<
  S extends Schema.ConstraintDecoder<unknown> &
    Schema.ConstraintEncoder<unknown>,
  T
>(
  key: string,
  schema: S,
  initial: S["Type"],
  select: (value: S["Type"]) => T
): readonly [T, (update: (current: S["Type"]) => S["Type"]) => void] {
  const schemaRef = useRef(schema)
  schemaRef.current = schema
  const initialRef = useRef(initial)
  initialRef.current = initial
  const selectRef = useRef(select)
  selectRef.current = select

  const subscribe = useCallback(
    (onStoreChange: () => void) => subscribeLocalStorage(key, onStoreChange),
    [key]
  )
  const getSnapshot = useCallback(
    () =>
      selectRef.current(snapshot(key, schemaRef.current, initialRef.current)),
    [key]
  )
  const getServerSnapshot = useCallback(
    () => selectRef.current(initialRef.current),
    []
  )
  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const write = useCallback(
    (update: (current: S["Type"]) => S["Type"]) => {
      const current = snapshot(key, schemaRef.current, initialRef.current)
      setLocalStorageSnapshot(key, schemaRef.current, update(current))
    },
    [key]
  )
  return useMemo(() => [value, write] as const, [value, write])
}

export function useLocalStorageState<
  S extends Schema.ConstraintDecoder<unknown> &
    Schema.ConstraintEncoder<unknown>
>(
  key: string,
  schema: S,
  initial: S["Type"]
): readonly [S["Type"], (next: S["Type"]) => void] {
  const [value, update] = useLocalStorageSelect(key, schema, initial, identity)
  const write = useCallback((next: S["Type"]) => update(() => next), [update])
  return useMemo(() => [value, write] as const, [value, write])
}

function identity<T>(value: T): T {
  return value
}
