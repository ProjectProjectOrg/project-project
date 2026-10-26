import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import { useCallback, useMemo, useRef, useSyncExternalStore } from "react"

type Snapshot<A> = Readonly<{ raw: string | null; value: A }>

type LocalStorageCodec<A> = Readonly<{
  readSnapshot: (key: string, initial: A) => A
  encode: (value: A) => string
}>

const listeners = new Map<string, Set<() => void>>()

const snapshotCodec = <A>(
  parse: (raw: string) => Result.Result<A, unknown>,
  encode: (value: A) => string
): LocalStorageCodec<A> => {
  const snapshots = new Map<string, Snapshot<A>>()
  return {
    encode,
    readSnapshot: (key, initial) => {
      const raw = readRaw(key)
      const cached = snapshots.get(key)
      if (cached !== undefined && cached.raw === raw) return cached.value
      const parsed = raw === null ? undefined : parse(raw)
      const value =
        parsed !== undefined && Result.isSuccess(parsed)
          ? parsed.success
          : initial
      snapshots.set(key, { raw, value })
      return value
    }
  }
}

export function createLocalStorageCodec<
  S extends Schema.ConstraintDecoder<unknown> &
    Schema.ConstraintEncoder<unknown>
>(schema: S): LocalStorageCodec<S["Type"]> {
  const json = Schema.fromJsonString(schema)
  return snapshotCodec(Schema.decodeResult(json), Schema.encodeSync(json))
}

export function createLocalStorageStringCodec<A extends string>(
  schema: Schema.Codec<A, A>
): LocalStorageCodec<A> {
  const isA = Schema.is(schema)
  return snapshotCodec(
    (raw) => (isA(raw) ? Result.succeed(raw) : Result.fail(raw)),
    (value) => value
  )
}

function readRaw(key: string): string | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export function readLocalStorage<A>(
  key: string,
  codec: LocalStorageCodec<A>,
  initial: NoInfer<A>
): A {
  return codec.readSnapshot(key, initial)
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
      for (const key of listeners.keys()) notify(key)
      return
    }
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

function setLocalStorageSnapshot<A>(
  key: string,
  codec: LocalStorageCodec<A>,
  next: A
): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(key, codec.encode(next))
    } catch {
      return
    }
  }
  notify(key)
}

export function useLocalStorageSelect<A, T>(
  key: string,
  codec: LocalStorageCodec<A>,
  initial: NoInfer<A>,
  select: (value: A) => T
): readonly [T, (update: (current: A) => A) => void] {
  const codecRef = useRef(codec)
  codecRef.current = codec
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
      selectRef.current(codecRef.current.readSnapshot(key, initialRef.current)),
    [key]
  )
  const getServerSnapshot = useCallback(
    () => selectRef.current(initialRef.current),
    []
  )
  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const write = useCallback(
    (update: (current: A) => A) => {
      const current = codecRef.current.readSnapshot(key, initialRef.current)
      setLocalStorageSnapshot(key, codecRef.current, update(current))
    },
    [key]
  )
  return useMemo(() => [value, write] as const, [value, write])
}

export function useLocalStorageState<A>(
  key: string,
  codec: LocalStorageCodec<A>,
  initial: NoInfer<A>
): readonly [A, (next: A) => void] {
  const [value, update] = useLocalStorageSelect(key, codec, initial, identity)
  const write = useCallback((next: A) => update(() => next), [update])
  return useMemo(() => [value, write] as const, [value, write])
}

function identity<T>(value: T): T {
  return value
}
