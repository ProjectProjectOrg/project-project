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

const MARKER = "# Added by the pp installer"
const isPathExport = (line: string | undefined) =>
  line !== undefined && /^export PATH="[^"]*"$/.test(line)

const withoutInstallerPath = (text: string) => {
  const lines = text.split("\n")
  const kept: Array<string> = []
  for (let index = 0; index < lines.length; index++) {
    if (lines[index] === MARKER && isPathExport(lines[index + 1])) {
      if (kept.at(-1) === "") kept.pop()
      index++
      continue
    }
    kept.push(lines[index] ?? "")
  }
  return kept.join("\n")
}

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
  const home = yield* Config.String("HOME").pipe(Effect.orElseSucceed(() => ""))
  const cleaned: Array<string> = []
  const failed: Array<string> = []
  if (home === "") return { cleaned, failed }
  for (const name of profiles) {
    const file = path.join(home, name)
    const text = yield* fs
      .readFileString(file)
      .pipe(Effect.orElseSucceed(() => undefined))
    if (text === undefined) continue
    const next = withoutInstallerPath(text)
    if (next === text) continue
    const written = yield* fs.writeFileString(file, next).pipe(
      Effect.as(true),
      Effect.orElseSucceed(() => false)
    )
    if (written) cleaned.push(file)
    else failed.push(file)
  }
  return { cleaned, failed }
})

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
      const { cleaned, failed } = yield* cleanProfiles
      const binary = buildVersion === "dev" ? null : process.execPath
      if (binary !== null) yield* fs.remove(binary, { force: true })

      if (flags.json) {
        return yield* printResult(
          {
            signedOut: servers.map((server) => server.origin),
            removed: [...(binary === null ? [] : [binary]), settings],
            profiles: cleaned,
            profilesLeft: failed
          },
          true
        )
      }
      yield* Console.log(
        [
          ...servers.map((server) => `Signed out of ${server.origin}.`),
          `Deleted ${settings}.`,
          ...cleaned.map((file) => `Took pp off your PATH in ${file}.`),
          ...failed.map(
            (file) =>
              `Couldn't edit ${file}. Remove the "${MARKER}" line and the PATH line under it yourself.`
          ),
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
