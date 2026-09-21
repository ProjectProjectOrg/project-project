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

export function useLocalStorageState<
  S extends Schema.ConstraintDecoder<unknown> &
    Schema.ConstraintEncoder<unknown>
>(
  key: string,
  schema: S,
  initial: S["Type"]
): readonly [S["Type"], (next: S["Type"]) => void] {
  const schemaRef = useRef(schema)
  schemaRef.current = schema
  const initialRef = useRef(initial)
  initialRef.current = initial

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
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
    },
    [key]
  )

  const getSnapshot = useCallback(
    () => snapshot(key, schemaRef.current, initialRef.current),
    [key]
  )
  const getServerSnapshot = useCallback(() => initialRef.current, [])

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const write = useCallback(
    (next: S["Type"]) => {
      if (typeof window === "undefined") return
      try {
        const encoded = Schema.encodeSync(
          Schema.fromJsonString(schemaRef.current)
        )(next)
        window.localStorage.setItem(key, encoded)
      } catch {
        return
      }
      snapshots.delete(key)
      notify(key)
    },
    [key]
  )

  return useMemo(() => [value, write] as const, [value, write])
}
