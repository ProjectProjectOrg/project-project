import { it } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { expect } from "vitest"

import { MemoryStorageLive } from "@/servers/memoryStorage"

import { cacheSlot, ViewCache, ViewCacheLive } from "./ViewCache"

const layer = ViewCacheLive.pipe(Layer.provide(MemoryStorageLive))

const counts = cacheSlot(
  "counts",
  Schema.Struct({ total: Schema.Finite, at: Schema.DateFromString })
)
const labels = cacheSlot("labels", Schema.Array(Schema.String))

const noon = DateTime.toDateUtc(DateTime.makeUnsafe("2026-09-28T12:00:00.000Z"))

it.effect("reads back what it wrote", () =>
  Effect.gen(function* () {
    const cache = yield* ViewCache
    const value = { total: 3, at: noon }
    yield* cache.write("a", counts, value)
    expect(yield* cache.read("a", counts)).toEqual(Option.some(value))
  }).pipe(Effect.provide(layer))
)

it.effect("treats an entry that no longer decodes as missing", () =>
  Effect.gen(function* () {
    const cache = yield* ViewCache
    yield* cache.write("a", labels, ["todo"])
    const changed = cacheSlot("labels", Schema.Array(Schema.Finite))
    expect(yield* cache.read("a", changed)).toEqual(Option.none())
  }).pipe(Effect.provide(layer))
)

it.effect("clears one server's entries and keeps the others", () =>
  Effect.gen(function* () {
    const cache = yield* ViewCache
    yield* cache.write("a", labels, ["todo"])
    yield* cache.write("a", counts, { total: 1, at: noon })
    yield* cache.write("b", labels, ["done"])
    yield* cache.clear("a")
    expect(yield* cache.read("a", labels)).toEqual(Option.none())
    expect(yield* cache.read("a", counts)).toEqual(Option.none())
    expect(yield* cache.read("b", labels)).toEqual(Option.some(["done"]))
  }).pipe(Effect.provide(layer))
)
