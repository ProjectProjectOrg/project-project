import { it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import { expect } from "vitest"

import { MemoryStorageLive } from "./memoryStorage"
import type { SavedServer } from "./model"
import { ServerStore, ServerStoreLive } from "./ServerStore"

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

const withStore = <A, E>(
  use: (store: typeof ServerStore.Service) => Effect.Effect<A, E>
) =>
  Effect.gen(function* () {
    const store = yield* ServerStore
    return yield* use(store)
  }).pipe(
    Effect.provide(ServerStoreLive),
    Effect.provide(MemoryStorageLive)
  )

it.effect("replaces a saved server by instance id instead of duplicating it", () =>
  withStore((store) =>
    Effect.gen(function* () {
      yield* store.save(server("a", "Igne"))
      yield* store.save({ ...server("a", "Igne"), origin: "https://moved.example" })
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
      expect((yield* store.list).map((entry) => entry.instanceId)).toEqual(["b"])
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
