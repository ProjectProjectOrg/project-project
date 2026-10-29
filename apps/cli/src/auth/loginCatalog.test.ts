import * as BunServices from "@effect/platform-bun/BunServices"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import { ServerStore } from "../servers/ServerStore"
import { fakeHttp } from "../testing"
import { Browser } from "./Browser"
import { login } from "./login"
import { Loopback } from "./Loopback"

const origin = "https://pp.example.com"

const opened: Array<string> = []

const services = Layer.mergeAll(
  Layer.succeed(
    Loopback,
    Loopback.of({ listen: () => Effect.die("not reached") })
  ),
  Layer.succeed(
    Browser,
    Browser.of({ open: (url) => Effect.sync(() => opened.push(url) > 0) })
  ),
  Layer.succeed(
    ServerStore,
    ServerStore.of({
      file: "servers.json",
      list: Effect.die("unused"),
      save: () => Effect.die("unused"),
      remove: () => Effect.die("unused"),
      setDefault: () => Effect.die("unused"),
      setScope: () => Effect.die("unused"),
      update: () => Effect.die("unused"),
      select: () => Effect.die("unused")
    })
  ),
  BunServices.layer,
  fakeHttp((url) =>
    url.pathname.startsWith("/.well-known/oauth-protected-resource")
      ? Response.json({
          resource: `${origin}/api/v1/tools`,
          authorization_servers: [`${origin}/api/auth`],
          pp_catalog_version: "00000000"
        })
      : Response.json({
          issuer: `${origin}/api/auth`,
          authorization_endpoint: `${origin}/api/auth/oauth2/authorize`,
          token_endpoint: `${origin}/api/auth/oauth2/token`
        })
  )
)

describe("login", () => {
  it.effect("stops before the browser when the server's catalog differs", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(login("pp.example.com"))
      expect(failure.code).toBe(10)
      expect(failure.message).toContain(
        "curl -fsSL https://pp.example.com/api/cli/install.sh | sh"
      )
      expect(opened).toEqual([])
    }).pipe(Effect.provide(services))
  )
})
