import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"

import { CliFailure, ExitCode } from "../CliFailure"

export const PROJECT_FILE = ".pp.json"

export const ProjectConfig = Schema.Struct({
  server: Schema.optional(Schema.String),
  org: Schema.String,
  project: Schema.optional(Schema.String)
})
export type ProjectConfig = typeof ProjectConfig.Type

const ProjectConfigJson = Schema.fromJsonString(ProjectConfig, { space: 2 })
const encodeProjectConfig = Schema.encodeEffect(ProjectConfigJson)

const findUp = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  directory: string
): Effect.Effect<Option.Option<string>> =>
  Effect.gen(function* () {
    const candidate = path.join(directory, PROJECT_FILE)
    if (yield* fs.exists(candidate).pipe(Effect.orElseSucceed(() => false))) {
      return Option.some(candidate)
    }
    const parent = path.dirname(directory)
    return parent === directory
      ? Option.none()
      : yield* findUp(fs, path, parent)
  })

export const readProjectConfig = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const found = yield* findUp(fs, path, path.resolve("."))
  if (Option.isNone(found)) return Option.none<ProjectConfig>()
  const config = yield* fs.readFileString(found.value).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(ProjectConfigJson)),
    Effect.mapError(
      () =>
        new CliFailure({
          message: `${found.value} isn't a valid pp project file. Run \`pp init\` to rewrite it.`,
          code: ExitCode.usage
        })
    )
  )
  return Option.some(config)
})

export const writeProjectConfig = Effect.fn("writeProjectConfig")(function* (
  config: ProjectConfig
) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const file = path.join(path.resolve("."), PROJECT_FILE)
  const text = yield* encodeProjectConfig(config).pipe(Effect.orDie)
  yield* fs.writeFileString(file, `${text}\n`).pipe(
    Effect.mapError(
      () =>
        new CliFailure({
          message: `Couldn't write ${file}.`,
          code: ExitCode.failure
        })
    )
  )
  return file
})
