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
  it.effect("keeps servers by origin, the first one as default", () =>
    inTempConfig(
      Effect.gen(function* () {
        const store = yield* ServerStore
        yield* store.save(server("https://a.example.com"))
        yield* store.save(server("https://b.example.com"))
        expect((yield* store.select(Option.none())).origin).toBe(
          "https://a.example.com"
        )
        expect(
          (yield* store.select(Option.some("https://b.example.com"))).origin
        ).toBe("https://b.example.com")
        yield* store.setDefault("https://b.example.com")
        expect((yield* store.select(Option.none())).origin).toBe(
          "https://b.example.com"
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
        expect(yield* store.remove("https://a.example.com")).toBe(true)
        expect((yield* store.list).defaultServer).toBe("https://b.example.com")
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
})
