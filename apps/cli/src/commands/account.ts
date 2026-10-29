import { Argument, Command } from "effect/cli"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"

import { login } from "../auth/login"
import { revokeToken } from "../auth/tokens"
import { usage } from "../CliFailure"
import { printResult } from "../output/format"
import { writeProjectConfig } from "../project/ProjectConfig"
import { originOf } from "../servers/origin"
import { type SavedServer, ServerStore } from "../servers/ServerStore"
import { currentScope, currentServer, requireSlug } from "./context"
import { root } from "./root"

const publicView = (server: SavedServer, isDefault: boolean) => ({
  server: server.origin,
  user: server.user.name,
  email: server.user.email,
  default: isDefault
})

const originArgument = (name: string, description: string) =>
  Argument.String(name).pipe(Argument.withDescription(description))

const requireOrigin = (address: string) =>
  Option.match(originOf(address), {
    onNone: () => Effect.fail(usage(`"${address}" isn't a valid address.`)),
    onSome: Effect.succeed
  })

export const loginCommand = Command.make(
  "login",
  {
    address: originArgument(
      "address",
      "The server's address, e.g. pp.example.com."
    )
  },
  ({ address }) =>
    Effect.gen(function* () {
      const flags = yield* root
      const server = yield* login(address)
      if (flags.json) return yield* printResult(publicView(server, true), true)
      yield* Console.log(
        `Signed in to ${server.origin} as ${server.user.name} (${server.user.email}).`
      )
    })
).pipe(
  Command.withDescription(
    "Sign in to a ProjectProject server in your browser and save it."
  ),
  Command.withExamples([
    { command: "pp login pp.example.com", description: "Sign in" }
  ])
)

export const logoutCommand = Command.make("logout", {}, () =>
  Effect.gen(function* () {
    const server = yield* currentServer
    if (server.endpoints.revocation !== undefined) {
      yield* revokeToken(
        server.endpoints.revocation,
        server.tokens.refreshToken
      )
    }
    yield* (yield* ServerStore).remove(server.origin)
    yield* Console.log(`Signed out of ${server.origin}.`)
  })
).pipe(
  Command.withDescription(
    "Sign out of a server: revoke its tokens and forget it. Uses --server or the default."
  )
)

const listServers = Command.make("list", {}, () =>
  Effect.gen(function* () {
    const flags = yield* root
    const catalog = yield* (yield* ServerStore).list
    yield* printResult(
      catalog.servers.map((server) =>
        publicView(server, server.origin === catalog.defaultServer)
      ),
      flags.json
    )
  })
).pipe(Command.withDescription("List the servers you're signed in to."))

const useServer = Command.make(
  "use",
  { address: originArgument("address", "The server to make the default.") },
  ({ address }) =>
    Effect.gen(function* () {
      const origin = yield* requireOrigin(address)
      yield* (yield* ServerStore).setDefault(origin)
      yield* Console.log(`${origin} is now your default server.`)
    })
).pipe(Command.withDescription("Make a saved server the default."))

export const serversCommand = Command.make("servers").pipe(
  Command.withDescription("Manage the servers you're signed in to."),
  Command.withSubcommands([listServers, useServer])
)

export const initCommand = Command.make("init", {}, () =>
  Effect.gen(function* () {
    const flags = yield* root
    const scope = yield* currentScope
    const org = yield* requireSlug(scope.org, "org")
    const server = yield* currentServer
    const file = yield* writeProjectConfig({
      server: server.origin,
      org,
      project: Option.getOrUndefined(scope.project)
    })
    yield* Console.log(
      `Wrote ${file}: commands in this directory now use ${org}${Option.match(
        scope.project,
        { onNone: () => "", onSome: (project) => `/${project}` }
      )} on ${server.origin}.`
    )
    if (flags.json) yield* printResult({ file }, true)
  })
).pipe(
  Command.withDescription(
    "Remember the server, org and project for this directory in .pp.json. Find slugs with `pp orgs list` and `pp projects list`."
  ),
  Command.withExamples([
    {
      command: "pp init --org acme --project website",
      description: "Use acme/website for commands run in this repository"
    }
  ])
)
