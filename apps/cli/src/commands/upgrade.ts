import { cliRelease, runInstaller } from "@pp/shared"
import { Command, Flag } from "effect/cli"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import { HttpClient, HttpClientResponse } from "effect/http"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import * as Schema from "effect/Schema"

import { CliFailure, ExitCode, unreachable } from "../CliFailure"
import { originOf } from "../servers/origin"
import { ServerStore } from "../servers/ServerStore"
import { serverRelease } from "../update/serverRelease"
import { buildVersion } from "../version"
import { serverChoice } from "./context"

const releases = `https://github.com/${cliRelease.repository}/releases`

const Release = Schema.Struct({
  tag_name: Schema.String,
  prerelease: Schema.Boolean,
  assets: Schema.Array(Schema.Struct({ name: Schema.String }))
})

const decodeReleases = HttpClientResponse.schemaBodyJson(Schema.Array(Release))

const latestNightly = Effect.gen(function* () {
  const client = yield* HttpClient.HttpClient
  const response = yield* client
    .get(
      `https://api.github.com/repos/${cliRelease.repository}/releases?per_page=30`
    )
    .pipe(Effect.flatMap(HttpClientResponse.filterStatusOk))
  const found = (yield* decodeReleases(response)).find(
    (release) =>
      release.prerelease &&
      release.assets.some((asset) => asset.name === "install.sh")
  )
  if (found === undefined) {
    return yield* unreachable("There's no nightly release of pp yet.")
  }
  return found.tag_name
}).pipe(
  Effect.catchTag("HttpClientError", () =>
    Effect.fail(unreachable("Couldn't reach GitHub to find the nightly."))
  ),
  Effect.catchTag("SchemaError", () =>
    Effect.fail(unreachable("GitHub sent an unexpected list of releases."))
  )
)

export const upgradeCommand = Command.make(
  "upgrade",
  {
    latest: Flag.Boolean("latest").pipe(
      Flag.withDescription(
        "Install the latest stable release instead of the one matching your server."
      ),
      Flag.withDefault(false)
    ),
    nightly: Flag.Boolean("nightly").pipe(
      Flag.withDescription("Install the latest nightly release."),
      Flag.withDefault(false)
    )
  },
  ({ latest, nightly }) =>
    Effect.gen(function* () {
      const catalog = yield* (yield* ServerStore).list
      const origin = Option.getOrElse(
        Option.flatMap(yield* serverChoice, (choice) => originOf(choice.value)),
        () => catalog.defaultServer
      )
      const tag = nightly
        ? Option.some(yield* latestNightly)
        : latest || origin === null
          ? Option.none<string>()
          : yield* serverRelease(origin)
      const url = Option.match(tag, {
        onSome: (found) => `${releases}/download/${found}/install.sh`,
        onNone: () => `${releases}/latest/download/install.sh`
      })
      const env: Record<string, string> = {}
      if (Option.isSome(tag)) env["PP_VERSION"] = tag.value
      if (buildVersion !== "dev") {
        env["PP_INSTALL_DIR"] = (yield* Path.Path).dirname(process.execPath)
      }
      const script = runInstaller(url, env)
      yield* Console.error(`pp ${buildVersion}: installing from ${url}`)
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const code = yield* spawner
        .exitCode(
          ChildProcess.make("sh", ["-c", script], {
            env: { PP_SKIP_LOGIN: "1" },
            extendEnv: true,
            stdout: "inherit",
            stderr: "inherit"
          })
        )
        .pipe(Effect.orElseSucceed(() => 1))
      if (code !== 0) {
        return yield* new CliFailure({
          message: "The upgrade didn't finish. Your current pp is unchanged.",
          code: ExitCode.failure
        })
      }
    })
).pipe(
  Command.withDescription(
    "Install the pp that matches your server (or --latest / --nightly)."
  )
)
