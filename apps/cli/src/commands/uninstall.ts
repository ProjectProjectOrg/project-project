import { Command, Flag, Prompt } from "effect/cli"
import * as Config from "effect/Config"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"

import { revokeToken } from "../auth/tokens"
import { CliFailure, ExitCode, usage } from "../CliFailure"
import { printResult } from "../output/format"
import { ServerStore } from "../servers/ServerStore"
import { buildVersion } from "../version"
import { root } from "./root"
import { canPrompt } from "./scope"

const profiles = [".zshrc", ".bashrc", ".bash_profile"]

const withoutInstallerPath = (text: string) =>
  text.replace(/\n?# Added by the pp installer\nexport PATH="[^"\n]*"\n?/g, "")

const confirmed = (yes: boolean, servers: number) =>
  Effect.gen(function* () {
    if (yes) return true
    if (!(yield* canPrompt)) {
      return yield* usage(
        "Run `pp uninstall --yes` to remove pp without being asked."
      )
    }
    return yield* Prompt.Confirm({
      message:
        servers === 0
          ? "Remove pp and its settings?"
          : `Remove pp, sign out of ${servers === 1 ? "1 server" : `${servers} servers`} and delete its settings?`
    }).pipe(
      Prompt.run,
      Effect.orElseSucceed(() => false)
    )
  })

const cleanProfiles = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const home = yield* Config.String("HOME")
  const cleaned: Array<string> = []
  for (const name of profiles) {
    const file = path.join(home, name)
    const text = yield* fs
      .readFileString(file)
      .pipe(Effect.orElseSucceed(() => undefined))
    if (text === undefined) continue
    const next = withoutInstallerPath(text)
    if (next === text) continue
    yield* fs.writeFileString(file, next)
    cleaned.push(file)
  }
  return cleaned
}).pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []))

export const uninstallCommand = Command.make(
  "uninstall",
  {
    yes: Flag.Boolean("yes").pipe(
      Flag.withDescription("Uninstall without asking first."),
      Flag.withDefault(false)
    )
  },
  ({ yes }) =>
    Effect.gen(function* () {
      const flags = yield* root
      const store = yield* ServerStore
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const servers = (yield* store.list.pipe(
        Effect.orElseSucceed(() => ({ servers: [] }))
      )).servers
      if (!(yield* confirmed(yes, servers.length))) {
        return yield* Console.log("Nothing was removed.")
      }

      yield* Effect.forEach(
        servers,
        (server) =>
          server.endpoints.revocation === undefined
            ? Effect.void
            : revokeToken(
                server.endpoints.revocation,
                server.tokens.refreshToken
              ),
        { concurrency: "unbounded", discard: true }
      )
      const settings = path.dirname(store.file)
      yield* fs.remove(settings, { recursive: true, force: true })
      const cleaned = yield* cleanProfiles
      const binary = buildVersion === "dev" ? null : process.execPath
      if (binary !== null) yield* fs.remove(binary, { force: true })

      if (flags.json) {
        return yield* printResult(
          {
            signedOut: servers.map((server) => server.origin),
            removed: [...(binary === null ? [] : [binary]), settings],
            profiles: cleaned
          },
          true
        )
      }
      yield* Console.log(
        [
          ...servers.map((server) => `Signed out of ${server.origin}.`),
          `Deleted ${settings}.`,
          ...cleaned.map((file) => `Took pp off your PATH in ${file}.`),
          binary === null
            ? "This pp runs from source, so there's no binary to remove."
            : `Removed ${binary}. pp is uninstalled.`
        ].join("\n")
      )
    }).pipe(
      Effect.catchTag("PlatformError", (error) =>
        Effect.fail(
          new CliFailure({
            message: `Couldn't finish uninstalling: ${error.message}`,
            code: ExitCode.failure
          })
        )
      )
    )
).pipe(
  Command.withDescription(
    "Remove pp: sign out of every server, delete its settings and take it off your PATH."
  )
)
