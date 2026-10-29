import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"

import { CliFailure, ExitCode, notSignedIn } from "../CliFailure"

export const SavedServer = Schema.Struct({
  origin: Schema.String,
  user: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    email: Schema.String
  }),
  endpoints: Schema.Struct({
    token: Schema.String,
    revocation: Schema.optional(Schema.String)
  }),
  tokens: Schema.Struct({
    accessToken: Schema.String,
    refreshToken: Schema.String,
    expiresAt: Schema.Finite
  })
})
export type SavedServer = typeof SavedServer.Type

const ServerCatalog = Schema.Struct({
  version: Schema.Literal(1),
  defaultServer: Schema.NullOr(Schema.String),
  servers: Schema.Array(SavedServer)
})
type ServerCatalog = typeof ServerCatalog.Type

const CatalogJson = Schema.fromJsonString(ServerCatalog, { space: 2 })
const decodeCatalog = Schema.decodeUnknownEffect(CatalogJson)
const encodeCatalog = Schema.encodeEffect(CatalogJson)

const emptyCatalog: ServerCatalog = {
  version: 1,
  defaultServer: null,
  servers: []
}

const configHome = Config.String("XDG_CONFIG_HOME").pipe(
  Config.orElse(() =>
    Config.String("HOME").pipe(Config.map((home) => `${home}/.config`))
  ),
  Config.orElse(() => Config.String("APPDATA"))
)

const storageFailure = (path: string) => () =>
  new CliFailure({
    message: `Couldn't read or write ${path}.`,
    code: ExitCode.failure
  })

export class ServerStore extends Context.Service<
  ServerStore,
  Readonly<{
    file: string
    list: Effect.Effect<ServerCatalog, CliFailure>
    save: (server: SavedServer) => Effect.Effect<void, CliFailure>
    remove: (origin: string) => Effect.Effect<boolean, CliFailure>
    setDefault: (origin: string) => Effect.Effect<void, CliFailure>
    select: (
      preferred: Option.Option<string>
    ) => Effect.Effect<SavedServer, CliFailure>
  }>
>()("@pp/cli/servers/ServerStore") {
  static readonly layer = Layer.effect(
    ServerStore,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const directory = path.join(yield* configHome, "pp")
      const file = path.join(directory, "servers.json")
      const failure = storageFailure(file)

      const list = Effect.gen(function* () {
        const exists = yield* fs.exists(file)
        if (!exists) return emptyCatalog
        const text = yield* fs.readFileString(file)
        return yield* decodeCatalog(text)
      }).pipe(Effect.mapError(failure))

      const write = (catalog: ServerCatalog) =>
        Effect.gen(function* () {
          yield* fs.makeDirectory(directory, { recursive: true, mode: 0o700 })
          const text = yield* encodeCatalog(catalog)
          yield* fs.writeFileString(file, text, { mode: 0o600 })
          yield* fs.chmod(file, 0o600)
        }).pipe(Effect.mapError(failure))

      const save = (server: SavedServer) =>
        Effect.flatMap(list, (catalog) =>
          write({
            version: 1,
            defaultServer: catalog.defaultServer ?? server.origin,
            servers: [
              ...catalog.servers.filter(
                (saved) => saved.origin !== server.origin
              ),
              server
            ]
          })
        )

      const remove = (origin: string) =>
        Effect.gen(function* () {
          const catalog = yield* list
          const servers = catalog.servers.filter(
            (saved) => saved.origin !== origin
          )
          if (servers.length === catalog.servers.length) return false
          yield* write({
            version: 1,
            defaultServer:
              catalog.defaultServer === origin
                ? (servers[0]?.origin ?? null)
                : catalog.defaultServer,
            servers
          })
          return true
        })

      const setDefault = (origin: string) =>
        Effect.gen(function* () {
          const catalog = yield* list
          if (!catalog.servers.some((saved) => saved.origin === origin)) {
            return yield* notSignedIn(
              `You're not signed in to ${origin}. Run \`pp login ${origin}\`.`
            )
          }
          yield* write({ ...catalog, defaultServer: origin })
        })

      const select = (preferred: Option.Option<string>) =>
        Effect.gen(function* () {
          const catalog = yield* list
          const wanted = Option.getOrElse(
            preferred,
            () => catalog.defaultServer ?? catalog.servers[0]?.origin ?? ""
          )
          const found = catalog.servers.find((saved) => saved.origin === wanted)
          if (found) return found
          return yield* notSignedIn(
            wanted === ""
              ? "You're not signed in. Run `pp login <address>` first."
              : `You're not signed in to ${wanted}. Run \`pp login ${wanted}\`.`
          )
        })

      return ServerStore.of({ file, list, save, remove, setDefault, select })
    })
  )
}
