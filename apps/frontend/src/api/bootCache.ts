import * as Option from "effect/Option"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
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
const latest = new Map<string, unknown>()

export const persisted =
  <A, I>(key: string, success: Schema.Codec<A, I>) =>
  <E>(
    self: Atom.Atom<AsyncResult.AsyncResult<A, E>>
  ): Atom.Atom<AsyncResult.AsyncResult<A, E>> => {
    const encode = Schema.encodeOption(success)
    const decode = Schema.decodeUnknownOption(success)
    return Atom.readable(
      (get) => {
        const live = get(self)
        if (AsyncResult.isSuccess(live)) {
          Option.map(encode(live.value), (value) => latest.set(key, value))
          return live
        }
        if (!AsyncResult.isInitial(live)) return live
        return Option.match(decode(saved.get(key)), {
          onNone: () => live,
          onSome: (value) => AsyncResult.success<A, E>(value, { waiting: true })
        })
      },
      (refresh) => refresh(self)
    )
  }

export const saveBoot = () => {
  try {
    storage()?.setItem(STORAGE_KEY, encodeSaved(Object.fromEntries(latest)))
  } catch {
    storage()?.removeItem(STORAGE_KEY)
  }
}

export const clearBoot = () => {
  saved = new Map()
  latest.clear()
  storage()?.removeItem(STORAGE_KEY)
}
