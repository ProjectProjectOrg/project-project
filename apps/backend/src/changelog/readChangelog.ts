import { AppApi, Changelog } from "@pp/shared"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import { HttpApiBuilder } from "effect/http-api"
import * as Schema from "effect/Schema"

const decodeChangelog = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Changelog)
)

const noChangelog: Changelog = { entries: [] }

// A server without a changelog.json (a dev build, or an image from before
// release notes) shows an empty changelog. Any other failure, such as a file
// that no longer matches the schema, is logged before falling back, so an
// empty page has a reason on record.
const readChangelog = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    return yield* decodeChangelog(yield* fs.readFileString(path))
  }).pipe(
    Effect.catchReason("PlatformError", "NotFound", () =>
      Effect.succeed(noChangelog)
    ),
    Effect.catch((error) =>
      Effect.as(
        Effect.logWarning(`Couldn't read the changelog at ${path}`, error),
        noChangelog
      )
    )
  )

export const ChangelogHandlerLive = HttpApiBuilder.group(
  AppApi,
  "changelog",
  (handlers) =>
    Effect.gen(function* () {
      const path = yield* Config.String("CHANGELOG_PATH").pipe(
        Config.withDefault("changelog.json")
      )
      return handlers.handle("get", () => readChangelog(path))
    })
)
