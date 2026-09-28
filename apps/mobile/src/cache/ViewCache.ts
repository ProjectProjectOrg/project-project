import * as Arr from "effect/Array"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Encoding from "effect/Encoding"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Semaphore from "effect/Semaphore"

import { KeyValueStorage } from "@/servers/storage"

export type CacheSlot<A> = Readonly<{
  name: string
  decode: (raw: string) => Option.Option<A>
  encode: (value: A) => Option.Option<string>
}>

export const cacheSlot = <A, I>(
  name: string,
  schema: Schema.Codec<A, I>
): CacheSlot<A> => {
  const json = Schema.fromJsonString(Schema.toCodecJson(schema))
  return {
    name,
    decode: Schema.decodeUnknownOption(json),
    encode: Schema.encodeOption(json)
  }
}

export type ViewCacheShape = Readonly<{
  read: <A>(
    instanceId: string,
    slot: CacheSlot<A>
  ) => Effect.Effect<Option.Option<A>>
  write: <A>(
    instanceId: string,
    slot: CacheSlot<A>,
    value: A
  ) => Effect.Effect<void>
  clear: (instanceId: string) => Effect.Effect<void>
}>

export class ViewCache extends Context.Service<ViewCache, ViewCacheShape>()(
  "@pp/mobile/cache/ViewCache"
) {}

const prefix = (instanceId: string) =>
  `pp.cache.v1.${Encoding.encodeHex(instanceId)}`

const indexKey = (instanceId: string) => `${prefix(instanceId)}.index`

const entryKey = (instanceId: string, name: string) =>
  `${prefix(instanceId)}.${Encoding.encodeHex(name)}`

const IndexJson = Schema.fromJsonString(Schema.Array(Schema.String))
const decodeIndex = Schema.decodeUnknownOption(IndexJson)
const encodeIndex = Schema.encodeSync(IndexJson)

export const ViewCacheLive = Layer.effect(
  ViewCache,
  Effect.gen(function* () {
    const storage = yield* KeyValueStorage
    const writes = yield* Semaphore.make(1)

    const readIndex = (instanceId: string) =>
      storage
        .get(indexKey(instanceId))
        .pipe(
          Effect.map((raw) =>
            Option.getOrElse(
              Option.flatMap(raw, decodeIndex),
              Arr.empty<string>
            )
          )
        )

    const read = <A>(instanceId: string, slot: CacheSlot<A>) =>
      storage.get(entryKey(instanceId, slot.name)).pipe(
        Effect.map((raw) => Option.flatMap(raw, slot.decode)),
        Effect.orElseSucceed(() => Option.none<A>())
      )

    const write = <A>(instanceId: string, slot: CacheSlot<A>, value: A) =>
      Effect.gen(function* () {
        const encoded = slot.encode(value)
        if (Option.isNone(encoded)) return
        const index = yield* readIndex(instanceId)
        if (!index.includes(slot.name)) {
          yield* storage.set(
            indexKey(instanceId),
            encodeIndex([...index, slot.name])
          )
        }
        yield* storage.set(entryKey(instanceId, slot.name), encoded.value)
      }).pipe(
        writes.withPermits(1),
        Effect.catchCause((cause) =>
          Effect.logWarning("Couldn’t cache a view", cause)
        )
      )

    const clear = (instanceId: string) =>
      writes
        .withPermits(1)(
          Effect.gen(function* () {
            const index = yield* readIndex(instanceId)
            yield* Effect.forEach(
              index,
              (name) => storage.remove(entryKey(instanceId, name)),
              { discard: true }
            )
            yield* storage.remove(indexKey(instanceId))
          })
        )
        .pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("Couldn’t clear cached views", cause)
          )
        )

    return { read, write, clear }
  })
)
