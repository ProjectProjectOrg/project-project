import * as Option from "effect/Option"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import type * as Registry from "effect/reactivity/AtomRegistry"
import * as Schema from "effect/Schema"

const STORAGE_KEY = "pp:boot"

const Saved = Schema.fromJsonString(
  Schema.Record(Schema.String, Schema.Unknown)
)
const decodeSaved = Schema.decodeUnknownOption(Saved)
const encodeSaved = Schema.encodeSync(Saved)

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

export const persisted =
  <A, I>(
    key: string,
    success: Schema.Codec<A, I>,
    trim: (value: A) => A = (value) => value
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
          Option.map(encode(trim(live.value)), (value) =>
            latest.set(key, value)
          )
          return live
        }
        if (!AsyncResult.isInitial(live)) return live
        const kept = latest.get(key) ?? saved.get(key)
        return Option.match(decode(kept), {
          onNone: () => live,
          onSome: (value) => {
            latest.set(key, kept)
            return AsyncResult.success<A, E>(value, { waiting: true })
          }
        })
      },
      (refresh) => refresh(self)
    )
  }

export const saveBoot = (registry: Registry.AtomRegistry) => {
  try {
    storage()?.setItem(
      STORAGE_KEY,
      encodeSaved(Object.fromEntries(latestIn(registry)))
    )
  } catch {
    storage()?.removeItem(STORAGE_KEY)
  }
}

export const clearBoot = () => {
  saved = new Map()
  storage()?.removeItem(STORAGE_KEY)
}
