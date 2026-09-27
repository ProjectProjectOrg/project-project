import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Encoding from "effect/Encoding"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Semaphore from "effect/Semaphore"

import {
  emptyCatalog,
  type OrgLocation,
  type SavedServer,
  ServerCatalog,
  type ServerIdentity,
  ServerTokens
} from "./model"
import { KeyValueStorage, SecureStorage, type StorageFailure } from "./storage"

export class CatalogUnreadable extends Data.TaggedError("CatalogUnreadable")<
  Readonly<{ cause: Schema.SchemaError }>
> {}

export class ServerNotSaved extends Data.TaggedError("ServerNotSaved")<
  Readonly<{ instanceId: string }>
> {}

export type CatalogFailure = StorageFailure | CatalogUnreadable

export type ServerStoreShape = Readonly<{
  list: Effect.Effect<ReadonlyArray<SavedServer>, CatalogFailure>
  save: (server: SavedServer) => Effect.Effect<void, CatalogFailure>
  register: (identity: ServerIdentity) => Effect.Effect<void, CatalogFailure>
  remove: (instanceId: string) => Effect.Effect<void, CatalogFailure>
  tokens: (
    instanceId: string
  ) => Effect.Effect<Option.Option<ServerTokens>, StorageFailure>
  attachTokens: (
    instanceId: string,
    tokens: ServerTokens
  ) => Effect.Effect<void, CatalogFailure | ServerNotSaved>
  completeSignIn: (
    server: SavedServer,
    tokens: ServerTokens
  ) => Effect.Effect<void, CatalogFailure>
  clearTokens: (instanceId: string) => Effect.Effect<void, StorageFailure>
  lastUsedOrg: Effect.Effect<Option.Option<OrgLocation>, CatalogFailure>
  setLastUsedOrg: (location: OrgLocation) => Effect.Effect<void, CatalogFailure>
}>

export class ServerStore extends Context.Service<
  ServerStore,
  ServerStoreShape
>()("@pp/mobile/servers/ServerStore") {}

export const catalogKey = "pp.servers.v1"

export const tokensKey = (instanceId: string) =>
  `pp.tokens.${Encoding.encodeHex(instanceId)}`

const catalogJson = Schema.fromJsonString(ServerCatalog)
const decodeCatalog = Schema.decodeUnknownEffect(catalogJson)
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
    const serialized = writes.withPermits(1)

    const readCatalog = Effect.flatMap(
      storage.get(catalogKey),
      Option.match({
        onNone: () => Effect.succeed(emptyCatalog),
        onSome: (raw) =>
          decodeCatalog(raw).pipe(
            Effect.mapError((cause) => new CatalogUnreadable({ cause }))
          )
      })
    )

    const writeCatalog = (change: (catalog: ServerCatalog) => ServerCatalog) =>
      Effect.flatMap(readCatalog, (catalog) =>
        storage.set(catalogKey, encodeCatalog(change(catalog)))
      )

    const save = (server: SavedServer) =>
      serialized(
        writeCatalog((catalog) => ({
          ...catalog,
          servers: [
            ...catalog.servers.filter(
              (saved) => saved.instanceId !== server.instanceId
            ),
            server
          ]
        }))
      )

    const register = (identity: ServerIdentity) =>
      serialized(
        Effect.gen(function* () {
          const catalog = yield* readCatalog
          const displaced = catalog.servers.filter(
            (saved) =>
              saved.origin === identity.origin &&
              saved.instanceId !== identity.instanceId
          )
          yield* Effect.forEach(
            displaced,
            (saved) => secure.remove(tokensKey(saved.instanceId)),
            { discard: true }
          )
          const existing = catalog.servers.find(
            (saved) => saved.instanceId === identity.instanceId
          )
          const kept = catalog.servers.filter(
            (saved) =>
              saved.instanceId !== identity.instanceId &&
              !displaced.includes(saved)
          )
          yield* storage.set(
            catalogKey,
            encodeCatalog({
              ...catalog,
              servers: [
                ...kept,
                {
                  user: existing?.user ?? null,
                  orgs: existing?.orgs ?? [],
                  ...identity
                }
              ],
              lastUsedOrg: displaced.some(
                (saved) => saved.instanceId === catalog.lastUsedOrg?.instanceId
              )
                ? null
                : catalog.lastUsedOrg
            })
          )
        })
      )

    const remove = (instanceId: string) =>
      serialized(
        Effect.andThen(
          secure.remove(tokensKey(instanceId)),
          writeCatalog((catalog) => ({
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
      )

    const tokens = (instanceId: string) =>
      secure
        .get(tokensKey(instanceId))
        .pipe(Effect.map((raw) => Option.flatMap(raw, decodeTokens)))

    const attachTokens = (instanceId: string, value: ServerTokens) =>
      serialized(
        readCatalog.pipe(
          Effect.filterOrFail(
            (catalog) =>
              catalog.servers.some((saved) => saved.instanceId === instanceId),
            () => new ServerNotSaved({ instanceId })
          ),
          Effect.andThen(secure.set(tokensKey(instanceId), encodeTokens(value)))
        )
      )

    const completeSignIn = (server: SavedServer, value: ServerTokens) =>
      serialized(
        Effect.gen(function* () {
          const key = tokensKey(server.instanceId)
          const previous = yield* secure.get(key)
          yield* secure.set(key, encodeTokens(value))
          yield* writeCatalog((catalog) => ({
            ...catalog,
            servers: [
              ...catalog.servers.filter(
                (saved) => saved.instanceId !== server.instanceId
              ),
              server
            ]
          })).pipe(
            Effect.tapError(() =>
              Option.match(previous, {
                onNone: () => secure.remove(key),
                onSome: (raw) => secure.set(key, raw)
              }).pipe(Effect.ignore)
            )
          )
        }).pipe(Effect.uninterruptible)
      )

    const clearTokens = (instanceId: string) =>
      serialized(secure.remove(tokensKey(instanceId)))

    const setLastUsedOrg = (location: OrgLocation) =>
      serialized(
        writeCatalog((catalog) => ({ ...catalog, lastUsedOrg: location }))
      )

    return ServerStore.of({
      list: Effect.map(readCatalog, (catalog) => catalog.servers),
      save,
      register,
      remove,
      tokens,
      attachTokens,
      completeSignIn,
      clearTokens,
      lastUsedOrg: Effect.map(readCatalog, (catalog) =>
        Option.fromNullishOr(catalog.lastUsedOrg)
      ),
      setLastUsedOrg
    })
  })
)
