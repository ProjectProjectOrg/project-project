import { it } from "@effect/vitest"
import {
  appProtocolVersion,
  type InstanceDescriptor,
  InstanceNotConfigured
} from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as TestClock from "effect/testing/TestClock"
import { FetchHttpClient } from "effect/unstable/http"
import { describe, expect } from "vitest"

import { answeredOrigin, checkServer, checkTimeout } from "./checkServer"

const descriptor = {
  instanceId: "3f9c2a7e8b1d4c6f",
  name: "Igne",
  logo: null,
  serverVersion: "sha-457effd",
  protocolVersion: appProtocolVersion
}

const json = (body: InstanceDescriptor | InstanceNotConfigured, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  })

const respondWith = (respond: () => Promise<Response>) =>
  FetchHttpClient.layer.pipe(
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, respond))
  )

const problemFor = (respond: () => Promise<Response>) =>
  checkServer("https://pp.igne.nl").pipe(
    Effect.flip,
    Effect.map((error) => error.problem),
    Effect.provide(respondWith(respond))
  )

it.effect("returns the descriptor of a compatible server", () =>
  checkServer("https://pp.igne.nl").pipe(
    Effect.map((checked) =>
      expect(checked).toEqual({ origin: "https://pp.igne.nl", descriptor })
    ),
    Effect.provide(respondWith(async () => json(descriptor)))
  )
)

it.effect("tells the user what is wrong with the server", () =>
  Effect.gen(function* () {
    expect(
      yield* problemFor(async () => {
        throw new TypeError("Network request failed")
      })
    ).toBe("unreachable")
    expect(
      yield* problemFor(
        async () => new Response("<html></html>", { status: 200 })
      )
    ).toBe("not_projectproject")
    expect(
      yield* problemFor(async () => json(new InstanceNotConfigured(), 503))
    ).toBe("not_configured")
    expect(
      yield* problemFor(async () =>
        json({ ...descriptor, protocolVersion: appProtocolVersion - 1 })
      )
    ).toBe("server_outdated")
    expect(
      yield* problemFor(async () =>
        json({ ...descriptor, protocolVersion: appProtocolVersion + 1 })
      )
    ).toBe("app_outdated")
  })
)

it.effect("gives up on a server that doesn't answer", () =>
  Effect.gen(function* () {
    const fiber = yield* Effect.forkChild(
      problemFor(() => new Promise<Response>(() => {}))
    )
    yield* TestClock.adjust(checkTimeout)
    expect(yield* Fiber.join(fiber)).toBe("unreachable")
  })
)

describe("answeredOrigin", () => {
  it("keeps the address the descriptor was served from", () => {
    expect(
      answeredOrigin("https://pp.example", "https://pp.example/api/instance")
    ).toBe("https://pp.example")
    expect(
      answeredOrigin(
        "https://pp.example",
        "https://projects.example/api/instance"
      )
    ).toBe("https://projects.example")
  })

  it("refuses a redirect to plain http or to another page", () => {
    expect(
      answeredOrigin("https://pp.example", "http://pp.example/api/instance")
    ).toBe("insecure_redirect")
    expect(
      answeredOrigin("https://pp.example", "https://pp.example/login")
    ).toBe("not_projectproject")
  })
})
