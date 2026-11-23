import { CHANGELOG_VIDEO_FILE } from "@pp/shared"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

export const CHANGELOG_MEDIA_PREFIX = "/api/changelog-media/"

const notFound = HttpServerResponse.text("Not Found", { status: 404 })

const MediaParams = Schema.Struct({
  name: Schema.String.check(Schema.isPattern(CHANGELOG_VIDEO_FILE))
})

const RANGE = /^bytes=(\d*)-(\d*)$/

const byteRange = (header: string | undefined, size: number) => {
  const match = header === undefined ? null : RANGE.exec(header)
  if (match === null || (match[1] === "" && match[2] === "")) return null
  const start =
    match[1] === "" ? Math.max(0, size - Number(match[2])) : Number(match[1])
  const end =
    match[1] === "" || match[2] === ""
      ? size - 1
      : Math.min(Number(match[2]), size - 1)
  return start <= end ? { start, end } : "unsatisfiable"
}

const HEADERS = {
  "accept-ranges": "bytes",
  "cache-control": "public, max-age=86400"
}

// Streams a highlight video, or the byte range a seeking browser asks for.
const serveVideo = (dir: string) =>
  Effect.gen(function* () {
    const { name } = yield* HttpRouter.schemaPathParams(MediaParams)
    const req = yield* HttpServerRequest.HttpServerRequest
    const fs = yield* FileSystem.FileSystem
    const path = `${dir}/${name}`
    const size = Number((yield* fs.stat(path)).size)
    const range = byteRange(req.headers.range, size)
    if (range === "unsatisfiable")
      return HttpServerResponse.empty({
        status: 416,
        headers: { "content-range": `bytes */${size}` }
      })
    if (range === null)
      return yield* HttpServerResponse.file(path, {
        contentType: "video/mp4",
        headers: HEADERS
      })
    return yield* HttpServerResponse.file(path, {
      contentType: "video/mp4",
      status: 206,
      offset: range.start,
      bytesToRead: range.end - range.start + 1,
      headers: {
        ...HEADERS,
        "content-range": `bytes ${range.start}-${range.end}/${size}`
      }
    })
  }).pipe(
    Effect.catchTag("SchemaError", () => Effect.succeed(notFound)),
    Effect.catchReason("PlatformError", "NotFound", () =>
      Effect.succeed(notFound)
    ),
    // A missing mount or a permissions error is a broken deploy, not a
    // missing video: say so in the logs.
    Effect.catch((error) =>
      Effect.as(
        Effect.logError(`Couldn't serve changelog media from ${dir}`, error),
        HttpServerResponse.text("Internal Server Error", { status: 500 })
      )
    )
  )

export const ChangelogMediaRouteLive = Layer.unwrap(
  Effect.gen(function* () {
    const dir = yield* Config.String("CHANGELOG_MEDIA_DIR").pipe(
      Config.withDefault("changelog-media")
    )
    return HttpRouter.add(
      "GET",
      `${CHANGELOG_MEDIA_PREFIX}:name`,
      serveVideo(dir)
    )
  })
)
