import { it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import { expect } from "vitest"

import { memoryStorage, MemoryStorageLive } from "./memoryStorage"
import type { SavedServer } from "./model"
import {
  catalogKey,
  CatalogUnreadable,
  ServerNotSaved,
  ServerStore,
  ServerStoreLive,
  tokensKey
} from "./ServerStore"
import { KeyValueStorage, SecureStorage, StorageFailure } from "./storage"

const server = (instanceId: string, name: string): SavedServer => ({
  instanceId,
  origin: `https://${name.toLowerCase()}.example`,
  name,
  logo: null,
  protocolVersion: 1,
  user: null,
  orgs: [{ slug: name.toLowerCase(), name }]
})

const tokens = { accessToken: "access", refreshToken: "refresh", expiresAt: 1 }

const TestStoreLive = ServerStoreLive.pipe(
  Layer.provideMerge(MemoryStorageLive)
)

const withStore = <A, E>(
  use: (
    store: typeof ServerStore.Service
  ) => Effect.Effect<A, E, KeyValueStorage>
) =>
  Effect.gen(function* () {
    const store = yield* ServerStore
    return yield* use(store)
  }).pipe(Effect.provide(TestStoreLive))

it.effect(
  "replaces a saved server by instance id instead of duplicating it",
  () =>
    withStore((store) =>
      Effect.gen(function* () {
        yield* store.save(server("a", "Igne"))
        yield* store.save({
          ...server("a", "Igne"),
          origin: "https://moved.example"
        })
        yield* store.save(server("b", "Client"))
        const saved = yield* store.list
        expect(saved.map((entry) => [entry.instanceId, entry.origin])).toEqual([
          ["a", "https://moved.example"],
          ["b", "https://client.example"]
        ])
      })
    )
)

it.effect("keeps tokens per server and forgets them when the server goes", () =>
  withStore((store) =>
    Effect.gen(function* () {
      yield* store.save(server("a", "Igne"))
      yield* store.save(server("b", "Client"))
      yield* store.attachTokens("a", tokens)
      yield* store.attachTokens("b", { ...tokens, accessToken: "other" })
      yield* store.setLastUsedOrg({ instanceId: "a", orgSlug: "igne" })

      yield* store.remove("a")

      expect(yield* store.tokens("a")).toEqual(Option.none())
      expect(yield* store.tokens("b")).toEqual(
        Option.some({ ...tokens, accessToken: "other" })
      )
      expect(yield* store.lastUsedOrg).toEqual(Option.none())
      expect((yield* store.list).map((entry) => entry.instanceId)).toEqual([
        "b"
      ])
    })
  )
)

it.effect("clears only the tokens when signing out", () =>
  withStore((store) =>
    Effect.gen(function* () {
      yield* store.save(server("a", "Igne"))
      yield* store.attachTokens("a", tokens)
      yield* store.clearTokens("a")
      expect(yield* store.tokens("a")).toEqual(Option.none())
      expect((yield* store.list).length).toBe(1)
    })
  )
)

it.effect("refuses to overwrite a catalog it cannot read", () =>
  withStore((store) =>
    Effect.gen(function* () {
      const storage = yield* KeyValueStorage
      yield* storage.set(catalogKey, `{"version":2,"servers":[]}`)

      expect(
        yield* Effect.flip(store.save(server("a", "Igne")))
      ).toBeInstanceOf(CatalogUnreadable)
      expect(yield* storage.get(catalogKey)).toEqual(
        Option.some(`{"version":2,"servers":[]}`)
      )
      expect(yield* Effect.flip(store.list)).toBeInstanceOf(CatalogUnreadable)
    })
  )
)

it.effect("only keeps tokens for servers that are still saved", () =>
  withStore((store) =>
    Effect.gen(function* () {
      const attached = yield* Effect.flip(store.attachTokens("gone", tokens))
      expect(attached).toEqual(new ServerNotSaved({ instanceId: "gone" }))
      expect(yield* store.tokens("gone")).toEqual(Option.none())
    })
  )
)

it("stores tokens under keys SecureStore accepts, one per instance id", () => {
  const keys = ["team:prod", "team.prod", "Team Prod"].map(tokensKey)
  for (const key of keys) expect(key).toMatch(/^[\w.-]+$/)
  expect(new Set(keys).size).toBe(keys.length)
})

it.effect("keeps the signed-in account when a server is added again", () =>
  withStore((store) =>
    Effect.gen(function* () {
      yield* store.save({
        ...server("a", "Igne"),
        user: { id: "u", name: "Luuk", email: "luuk@igne.nl" }
      })
      yield* store.register({
        instanceId: "a",
        origin: "https://igne.example",
        name: "Igne renamed",
        logo: null,
        protocolVersion: 1
      })
      const [saved] = yield* store.list
      expect(saved?.name).toBe("Igne renamed")
      expect(saved?.user?.id).toBe("u")
      expect(saved?.orgs).toEqual([{ slug: "igne", name: "Igne" }])
    })
  )
)

it.effect(
  "replaces a server whose address now answers as another instance",
  () =>
    withStore((store) =>
      Effect.gen(function* () {
        yield* store.save(server("old", "Igne"))
        yield* store.attachTokens("old", tokens)
        yield* store.setLastUsedOrg({ instanceId: "old", orgSlug: "igne" })
        yield* store.register({
          instanceId: "new",
          origin: "https://igne.example",
          name: "Igne",
          logo: null,
          protocolVersion: 1
        })
        expect((yield* store.list).map((entry) => entry.instanceId)).toEqual([
          "new"
        ])
        expect(yield* store.tokens("old")).toEqual(Option.none())
        expect(yield* store.lastUsedOrg).toEqual(Option.none())
      })
    )
)

it.effect("leaves no new tokens when the account can't be saved", () =>
  Effect.gen(function* () {
    const store = yield* ServerStore
    const failure = yield* Effect.flip(
      store.completeSignIn(server("a", "Igne"), tokens)
    )
    expect(failure._tag).toBe("StorageFailure")
    expect(yield* store.tokens("a")).toEqual(Option.none())
  }).pipe(
    Effect.provide(
      ServerStoreLive.pipe(
        Layer.provide(
          Layer.mergeAll(
            Layer.succeed(KeyValueStorage, {
              get: () => Effect.succeedNone,
              set: () =>
                Effect.fail(
                  new StorageFailure({ operation: "write", cause: "full" })
                ),
              remove: () => Effect.void
            }),
            Layer.sync(SecureStorage, memoryStorage)
          )
        )
      )
    )
  )
)
