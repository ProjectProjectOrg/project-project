import * as Option from "effect/Option"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import type * as Registry from "effect/reactivity/AtomRegistry"
import * as Schema from "effect/Schema"

const STORAGE_KEY = "pp:boot"
const SAVED_CHARACTERS = 1_000_000

const Saved = Schema.fromJsonString(
  Schema.Record(Schema.String, Schema.Unknown)
)
const decodeSaved = Schema.decodeUnknownOption(Saved)

const storage = () => {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

const load = (): Map<string, unknown> =>
  new Map(
    Object.entries(
      Option.getOrElse(decodeSaved(storage()?.getItem(STORAGE_KEY)), () => ({}))
    )
  )

let saved = load()
const seen = new WeakMap<Registry.AtomRegistry, Map<string, unknown>>()

const latestIn = (registry: Registry.AtomRegistry) => {
  const existing = seen.get(registry)
  if (existing !== undefined) return existing
  const created = new Map<string, unknown>()
  seen.set(registry, created)
  return created
}

const remember = <V>(latest: Map<string, V>, key: string, value: V) => {
  latest.delete(key)
  latest.set(key, value)
}

export const persisted =
  <A, I>(
    key: string,
    success: Schema.Codec<A, I>,
    trim: (value: A, get: Atom.AtomContext) => A = (value) => value
  ) =>
  <E>(
    self: Atom.Atom<AsyncResult.AsyncResult<A, E>>
  ): Atom.Atom<AsyncResult.AsyncResult<A, E>> => {
    const encode = Schema.encodeOption(success)
    const decode = Schema.decodeUnknownOption(success)
    return Atom.readable(
      (get) => {
        const latest = latestIn(get.registry)
        const live = get(self)
        if (AsyncResult.isSuccess(live)) {
          Option.map(encode(trim(live.value, get)), (value) =>
            remember(latest, key, value)
          )
          return live
        }
        if (!AsyncResult.isInitial(live)) return live
        const kept = latest.get(key) ?? saved.get(key)
        return Option.match(decode(kept), {
          onNone: () => live,
          onSome: (value) => {
            remember(latest, key, kept)
            return AsyncResult.success<A, E>(value, { waiting: true })
          }
        })
      },
      (refresh) => refresh(self)
    )
  }

const json = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))

const newestFirst = (registry: Registry.AtomRegistry) => {
  const latest = latestIn(registry)
  const candidates = [
    ...[...latest].toReversed(),
    ...[...saved].filter(([key]) => !latest.has(key))
  ]
  const entries: Array<string> = []
  let budget = SAVED_CHARACTERS
  for (const [key, value] of candidates) {
    const entry = `${json(key)}:${json(value)}`
    if (entry.length > budget) continue
    budget -= entry.length + 1
    entries.push(entry)
  }
  return `{${entries.join(",")}}`
}

export const saveBoot = (registry: Registry.AtomRegistry) => {
  try {
    storage()?.setItem(STORAGE_KEY, newestFirst(registry))
  } catch {
    storage()?.removeItem(STORAGE_KEY)
  }
}

export const clearBoot = () => {
  saved = new Map()
  const store = storage()
  if (store === null) return
  const keys = Array.from({ length: store.length }, (_, index) =>
    store.key(index)
  )
  for (const key of keys)
    if (key === STORAGE_KEY || key?.startsWith(`${STORAGE_KEY}:`))
      store.removeItem(key)
}
