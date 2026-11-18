import * as Cause from "effect/Cause"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Stream from "effect/Stream"
import { createTarPacker } from "modern-tar"

export type TarEntry = Readonly<{ name: string; bytes: Uint8Array }>

export class TarGzError extends Data.TaggedError("TarGzError")<
  Readonly<{
    cause: unknown
  }>
> {}

const writeEntry = async (
  writable: WritableStream<Uint8Array>,
  bytes: Uint8Array
) => {
  const writer = writable.getWriter()
  await writer.ready
  await writer.write(bytes)
  await writer.close()
}

export const tarGz = <E, R>(entries: Stream.Stream<TarEntry, E, R>) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const { readable, controller } = createTarPacker()
      yield* entries.pipe(
        Stream.runForEach((entry) =>
          Effect.promise(() =>
            writeEntry(
              controller.add({
                name: entry.name,
                size: entry.bytes.byteLength
              }),
              entry.bytes
            )
          )
        ),
        Effect.andThen(Effect.sync(() => controller.finalize())),
        Effect.catchCause((cause) =>
          Effect.sync(() => controller.error(Cause.squash(cause)))
        ),
        Effect.forkScoped
      )
      return Stream.fromReadableStream({
        evaluate: () => readable.pipeThrough(new CompressionStream("gzip")),
        onError: (cause) => new TarGzError({ cause })
      })
    })
  )
