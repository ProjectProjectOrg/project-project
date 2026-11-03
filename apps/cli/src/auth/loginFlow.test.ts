import * as BunServices from "@effect/platform-bun/BunServices"
import { describe, expect, it } from "@effect/vitest"
import { catalogVersion } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import { FetchHttpClient, HttpClient } from "effect/http"
import * as Layer from "effect/Layer"

import { notSignedIn } from "../CliFailure"
import { type SavedServer, ServerStore } from "../servers/ServerStore"
import { fakeHttp } from "../testing"
import { Browser } from "./Browser"
import { login } from "./login"
import { Loopback } from "./Loopback"

const origin = "https://pp.example.com"
const signedInPage = `${origin}/cli/signed-in`
const failedPage = `${origin}/cli/sign-in-failed`

type Browsing = Readonly<{
  answer: (state: string) => Readonly<Record<string, string>>
  landed: Array<string>
  saved: Array<SavedServer>
  savedWhenLanded: Array<number>
}>

const browsing = (answer: Browsing["answer"]): Browsing => ({
  answer,
  landed: [],
  saved: [],
  savedWhenLanded: []
})

const services = (world: Browsing) => {
  const fibers: Array<Fiber.Fiber<void>> = []
  const browser = Layer.succeed(
    Browser,
    Browser.of({
      open: (authorize) =>
        Effect.gen(function* () {
          const query = new URL(authorize).searchParams
          const callback = new URL(query.get("redirect_uri") ?? "")
          for (const [key, value] of Object.entries(
            world.answer(query.get("state") ?? "")
          )) {
            callback.searchParams.set(key, value)
          }
          const fiber = yield* HttpClient.get(callback.href).pipe(
            Effect.map((response) => {
              world.landed.push(response.headers["location"] ?? "")
              world.savedWhenLanded.push(world.saved.length)
            }),
            Effect.orDie,
            Effect.provide(FetchHttpClient.layer),
            Effect.provideService(FetchHttpClient.RequestInit, {
              redirect: "manual"
            }),
            Effect.forkDetach
          )
          fibers.push(fiber)
          return true
        })
    })
  )
  const store = Layer.succeed(
    ServerStore,
    ServerStore.of({
      file: "servers.json",
      list: Effect.die("unused"),
      save: (server) =>
        Effect.sleep("300 millis").pipe(
          Effect.andThen(Effect.sync(() => void world.saved.push(server)))
        ),
      remove: () => Effect.die("unused"),
      setDefault: () => Effect.die("unused"),
      setScope: () => Effect.die("unused"),
      update: () => Effect.die("unused"),
      select: () => Effect.fail(notSignedIn("unused"))
    })
  )
  const server = fakeHttp((url) => {
    if (url.pathname.startsWith("/.well-known/oauth-protected-resource")) {
      return Response.json({
        resource: `${origin}/api/v1/tools`,
        authorization_servers: [`${origin}/api/auth`],
        pp_catalog_version: catalogVersion,
        pp_signed_in_page: signedInPage,
        pp_sign_in_failed_page: failedPage
      })
    }
    if (url.pathname.startsWith("/.well-known/")) {
      return Response.json({
        issuer: `${origin}/api/auth`,
        authorization_endpoint: `${origin}/api/auth/oauth2/authorize`,
        token_endpoint: `${origin}/api/auth/oauth2/token`
      })
    }
    if (url.pathname === "/api/auth/oauth2/token") {
      return Response.json({
        access_token: "access",
        refresh_token: "refresh",
        expires_in: 3600
      })
    }
    return Response.json({
      user: {
        id: "u-1",
        email: "ada@example.com",
        name: "Ada",
        username: null,
        image: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        personalGithub: { connected: false },
        personalEverhour: {
          connected: false,
          everhourUserId: null,
          name: null,
          email: null,
          lastVerifiedAt: null,
          lastCheckError: null
        }
      },
      roles: []
    })
  })
  const layer = Layer.mergeAll(browser, store, server, Loopback.layer).pipe(
    Layer.provideMerge(BunServices.layer)
  )
  const joinBrowser = Effect.forEach(fibers, Fiber.join, { discard: true })
  return { layer, joinBrowser }
}

describe("pp login in the browser", () => {
  it.live(
    "sends the browser to the signed-in page once the sign-in is saved",
    () => {
      const world = browsing((state) => ({ code: "abc", state }))
      const { layer, joinBrowser } = services(world)
      return Effect.gen(function* () {
        const server = yield* login("pp.example.com")
        yield* joinBrowser
        expect(server.user.email).toBe("ada@example.com")
        expect(world.landed).toEqual([signedInPage])
        expect(world.savedWhenLanded).toEqual([1])
      }).pipe(Effect.provide(layer))
    }
  )

  it.live(
    "sends the browser to the failed page with the reason when access is denied",
    () => {
      const world = browsing((state) => ({ error: "access_denied", state }))
      const { layer, joinBrowser } = services(world)
      return Effect.gen(function* () {
        const failure = yield* Effect.flip(login("pp.example.com"))
        yield* joinBrowser
        expect(failure).toMatchObject({
          code: 3,
          message: "Sign-in was cancelled."
        })
        expect(world.landed).toEqual([`${failedPage}?reason=access_denied`])
        expect(world.saved).toEqual([])
      }).pipe(Effect.provide(layer))
    }
  )
})
