import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Stream from "effect/Stream"
import { unpackTar } from "modern-tar"

import { tarGz, type TarEntry } from "./tarGz"

const encoder = new TextEncoder()

const unpack = (stream: Stream.Stream<Uint8Array, unknown>) =>
  Effect.promise(() =>
    unpackTar(
      Stream.toReadableStream(stream).pipeThrough(
        new DecompressionStream("gzip")
      )
    )
  )

describe("tarGz", () => {
  it.effect("packs every entry into a gzipped tar in order", () =>
    Effect.gen(function* () {
      const entries: ReadonlyArray<TarEntry> = [
        { name: "manifest.json", bytes: encoder.encode("{}") },
        { name: "project/tickets/T-1.md", bytes: encoder.encode("# One") }
      ]

      const unpacked = yield* unpack(tarGz(Stream.fromIterable(entries)))

      expect(
        unpacked.map((entry) => [
          entry.header.name,
          new TextDecoder().decode(entry.data)
        ])
      ).toEqual([
        ["manifest.json", "{}"],
        ["project/tickets/T-1.md", "# One"]
      ])
    })
  )

  it.effect("fails the archive when an entry fails", () =>
    Effect.gen(function* () {
      const entries = Stream.concat(
        Stream.make({ name: "a", bytes: encoder.encode("a") }),
        Stream.fail("storage down")
      )

      const result = yield* tarGz(entries).pipe(Stream.runDrain, Effect.flip)

      expect(result._tag).toBe("TarGzError")
    })
  )
})
