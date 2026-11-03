import * as BunServices from "@effect/platform-bun/BunServices"
import { describe, expect, it } from "@effect/vitest"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"

import { type SavedServer, ServerStore } from "./ServerStore"

const server = (origin: string): SavedServer => ({
  origin,
  user: { id: "u-1", name: "Ada", email: "ada@example.com" },
  endpoints: { token: `${origin}/api/auth/oauth2/token` },
  tokens: { accessToken: "a", refreshToken: "r", expiresAt: 1 }
})

const inTempConfig = <A, E>(
  effect: Effect.Effect<A, E, ServerStore | FileSystem.FileSystem>
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const home = yield* fs.makeTempDirectoryScoped()
    return yield* effect.pipe(
      Effect.provide(
        ServerStore.layer.pipe(
          Layer.provide(
            ConfigProvider.layer(
              ConfigProvider.fromUnknown({ XDG_CONFIG_HOME: home })
            )
          )
        )
      )
    )
  }).pipe(Effect.scoped, Effect.provide(BunServices.layer))

describe("ServerStore", () => {
  it.effect(
    "keeps servers by origin, the last one signed in to as default",
    () =>
      inTempConfig(
        Effect.gen(function* () {
          const store = yield* ServerStore
          yield* store.save(server("https://a.example.com"))
          yield* store.save(server("https://b.example.com"))
          expect((yield* store.select(Option.none())).origin).toBe(
            "https://b.example.com"
          )
          expect(
            (yield* store.select(Option.some("https://a.example.com"))).origin
          ).toBe("https://a.example.com")
          yield* store.setDefault("https://a.example.com")
          expect((yield* store.select(Option.none())).origin).toBe(
            "https://a.example.com"
          )
        })
      )
  )

  it.effect("keeps the token file readable only by you", () =>
    inTempConfig(
      Effect.gen(function* () {
        const store = yield* ServerStore
        yield* store.save(server("https://a.example.com"))
        const info = yield* (yield* FileSystem.FileSystem).stat(store.file)
        expect(info.mode & 0o777).toBe(0o600)
      })
    )
  )

  it.effect("moves the default when the default server is removed", () =>
    inTempConfig(
      Effect.gen(function* () {
        const store = yield* ServerStore
        yield* store.save(server("https://a.example.com"))
        yield* store.save(server("https://b.example.com"))
        expect(yield* store.remove("https://b.example.com")).toBe(true)
        expect((yield* store.list).defaultServer).toBe("https://a.example.com")
      })
    )
  )

  it.effect("asks you to sign in when nothing is saved", () =>
    inTempConfig(
      Effect.gen(function* () {
        const failure = yield* Effect.flip(
          (yield* ServerStore).select(Option.none())
        )
        expect(failure.code).toBe(3)
        expect(failure.message).toContain("pp login")
      })
    )
  )

  it.live("keeps every server when several pp processes save at once", () =>
    inTempConfig(
      Effect.gen(function* () {
        const store = yield* ServerStore
        const origins = Array.from(
          { length: 20 },
          (_, index) => `https://pp${index}.example.com`
        )
        yield* Effect.forEach(origins, (origin) => store.save(server(origin)), {
          concurrency: "unbounded"
        })
        const saved = (yield* store.list).servers.map((entry) => entry.origin)
        expect(saved.toSorted()).toEqual(origins.toSorted())
      })
    )
  )

  it.effect("keeps the saved default when a refresh saves an older copy", () =>
    inTempConfig(
      Effect.gen(function* () {
        const store = yield* ServerStore
        const origin = "https://a.example.com"
        yield* store.save(server(origin))
        const beforeUse = yield* store.select(Option.some(origin))
        yield* store.setScope(origin, Option.some({ org: "acme" }))
        yield* store.save({
          ...beforeUse,
          tokens: { accessToken: "a2", refreshToken: "r2", expiresAt: 2 }
        })
        const afterRefresh = yield* store.select(Option.some(origin))
        expect(afterRefresh.scope).toEqual({ org: "acme" })
        expect(afterRefresh.tokens.refreshToken).toBe("r2")
        yield* store.setScope(origin, Option.none())
        yield* store.save({ ...afterRefresh, tokens: beforeUse.tokens })
        expect((yield* store.select(Option.some(origin))).scope).toBeUndefined()
      })
    )
  )

  it.live("runs one update at a time against the latest saved copy", () =>
    inTempConfig(
      Effect.gen(function* () {
        const store = yield* ServerStore
        const origin = "https://a.example.com"
        yield* store.save(server(origin))
        yield* Effect.forEach(
          [1, 2, 3, 4, 5],
          () =>
            store.update(origin, (saved) =>
              Effect.succeed({
                ...saved,
                tokens: {
                  ...saved.tokens,
                  expiresAt: saved.tokens.expiresAt + 1
                }
              })
            ),
          { concurrency: "unbounded" }
        )
        expect(
          (yield* store.select(Option.some(origin))).tokens.expiresAt
        ).toBe(6)
      })
    )
  )

  it.effect("leaves a lock alone when another pp took it over meanwhile", () =>
    inTempConfig(
      Effect.gen(function* () {
        const store = yield* ServerStore
        const fs = yield* FileSystem.FileSystem
        const origin = "https://a.example.com"
        const lockPath = `${store.file}.lock`
        yield* store.save(server(origin))
        yield* store.update(origin, (saved) =>
          Effect.as(
            fs.writeFileString(`${lockPath}/owner`, "another pp"),
            saved
          )
        )
        expect(yield* fs.exists(lockPath)).toBe(true)
        expect(yield* fs.readFileString(`${lockPath}/owner`)).toBe("another pp")
      })
    )
  )
})
