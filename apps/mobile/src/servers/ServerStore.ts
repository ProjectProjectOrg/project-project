import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Semaphore from "effect/Semaphore"

import {
  emptyCatalog,
  type OrgLocation,
  type SavedServer,
  ServerCatalog,
  ServerTokens
} from "./model"
import { KeyValueStorage, SecureStorage, type StorageFailure } from "./storage"

export type ServerStoreShape = Readonly<{
  list: Effect.Effect<ReadonlyArray<SavedServer>, StorageFailure>
  save: (server: SavedServer) => Effect.Effect<void, StorageFailure>
  remove: (instanceId: string) => Effect.Effect<void, StorageFailure>
  tokens: (
    instanceId: string
  ) => Effect.Effect<Option.Option<ServerTokens>, StorageFailure>
  attachTokens: (
    instanceId: string,
    tokens: ServerTokens
  ) => Effect.Effect<void, StorageFailure>
  clearTokens: (instanceId: string) => Effect.Effect<void, StorageFailure>
  lastUsedOrg: Effect.Effect<Option.Option<OrgLocation>, StorageFailure>
  setLastUsedOrg: (location: OrgLocation) => Effect.Effect<void, StorageFailure>
}>

export class ServerStore extends Context.Service<
  ServerStore,
  ServerStoreShape
>()("@pp/mobile/servers/ServerStore") {}

export const catalogKey = "pp.servers.v1"

export const tokensKey = (instanceId: string) => `pp.tokens.${instanceId}`

const catalogJson = Schema.fromJsonString(ServerCatalog)
const decodeCatalog = Schema.decodeUnknownOption(catalogJson)
const encodeCatalog = Schema.encodeSync(catalogJson)

const tokensJson = Schema.fromJsonString(ServerTokens)
const decodeTokens = Schema.decodeUnknownOption(tokensJson)
const encodeTokens = Schema.encodeSync(tokensJson)

export const ServerStoreLive = Layer.effect(
  ServerStore,
  Effect.gen(function* () {
    const storage = yield* KeyValueStorage
    const secure = yield* SecureStorage
    const writes = yield* Semaphore.make(1)

    const readCatalog = storage
      .get(catalogKey)
      .pipe(
        Effect.map((raw) =>
          Option.getOrElse(Option.flatMap(raw, decodeCatalog), () => emptyCatalog)
        )
      )

    const updateCatalog = (
      change: (catalog: ServerCatalog) => ServerCatalog
    ) =>
      writes.withPermits(1)(
        Effect.flatMap(readCatalog, (catalog) =>
          storage.set(catalogKey, encodeCatalog(change(catalog)))
        )
      )

    const save = (server: SavedServer) =>
      updateCatalog((catalog) => ({
        ...catalog,
        servers: [
          ...catalog.servers.filter(
            (saved) => saved.instanceId !== server.instanceId
          ),
          server
        ]
      }))

    const remove = (instanceId: string) =>
      Effect.andThen(
        secure.remove(tokensKey(instanceId)),
        updateCatalog((catalog) => ({
          ...catalog,
          servers: catalog.servers.filter(
            (saved) => saved.instanceId !== instanceId
          ),
          lastUsedOrg:
            catalog.lastUsedOrg?.instanceId === instanceId
              ? null
              : catalog.lastUsedOrg
        }))
      )

    const tokens = (instanceId: string) =>
      secure
        .get(tokensKey(instanceId))
        .pipe(Effect.map((raw) => Option.flatMap(raw, decodeTokens)))

    const attachTokens = (instanceId: string, value: ServerTokens) =>
      secure.set(tokensKey(instanceId), encodeTokens(value))

    const clearTokens = (instanceId: string) =>
      secure.remove(tokensKey(instanceId))

    const setLastUsedOrg = (location: OrgLocation) =>
      updateCatalog((catalog) => ({ ...catalog, lastUsedOrg: location }))

    return ServerStore.of({
      list: Effect.map(readCatalog, (catalog) => catalog.servers),
      save,
      remove,
      tokens,
      attachTokens,
      clearTokens,
      lastUsedOrg: Effect.map(readCatalog, (catalog) =>
        Option.fromNullishOr(catalog.lastUsedOrg)
      ),
      setLastUsedOrg
    })
  })
)
