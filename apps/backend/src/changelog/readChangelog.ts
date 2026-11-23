import * as BunFileSystem from "@effect/platform-bun/BunFileSystem"
import { Changelog } from "@pp/shared"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Schema from "effect/Schema"

const decodeChangelog = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Changelog)
)

const noChangelog: Changelog = { entries: [] }

export const readChangelog = Effect.gen(function* () {
  const path = yield* Config.String("CHANGELOG_PATH").pipe(
    Config.withDefault("changelog.json")
  )
  const fs = yield* FileSystem.FileSystem
  return yield* decodeChangelog(yield* fs.readFileString(path))
}).pipe(
  Effect.catch(() => Effect.succeed(noChangelog)),
  Effect.provide(BunFileSystem.layer)
)
