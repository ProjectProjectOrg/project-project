import * as BunFileSystem from "@effect/platform-bun/BunFileSystem"
import { CHANGELOG_VIDEO_FILE } from "@pp/shared"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import { HttpServerRequest, HttpServerResponse } from "effect/http"

export const CHANGELOG_MEDIA_PREFIX = "/api/changelog-media/"

const notFound = HttpServerResponse.text("Not Found", { status: 404 })

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

export const changelogMediaRoute = Effect.gen(function* () {
  const req = yield* HttpServerRequest.HttpServerRequest
  const name = decodeURIComponent(
    new URL(req.url, "http://localhost").pathname.slice(
      CHANGELOG_MEDIA_PREFIX.length
    )
  )
  if (!CHANGELOG_VIDEO_FILE.test(name)) return notFound
  const dir = yield* Config.String("CHANGELOG_MEDIA_DIR").pipe(
    Config.withDefault("changelog-media")
  )
  const fs = yield* FileSystem.FileSystem
  const bytes = yield* fs.readFile(`${dir}/${name}`)
  const headers = {
    "content-type": "video/mp4",
    "accept-ranges": "bytes",
    "cache-control": "public, max-age=86400"
  }
  const range = byteRange(req.headers.range, bytes.length)
  if (range === "unsatisfiable")
    return HttpServerResponse.empty({
      status: 416,
      headers: { "content-range": `bytes */${bytes.length}` }
    })
  if (range === null) return HttpServerResponse.uint8Array(bytes, { headers })
  return HttpServerResponse.uint8Array(
    bytes.subarray(range.start, range.end + 1),
    {
      status: 206,
      headers: {
        ...headers,
        "content-range": `bytes ${range.start}-${range.end}/${bytes.length}`
      }
    }
  )
}).pipe(
  Effect.catch(() => Effect.succeed(notFound)),
  Effect.provide(BunFileSystem.layer)
)
