// @effect-diagnostics-next-line nodeBuiltinImport:off
import { createHmac } from "node:crypto"

import { it } from "@effect/vitest"
import * as ConfigProvider from "effect/ConfigProvider"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { afterAll, beforeAll, describe, expect } from "vitest"

import * as Sender from "../src/Sender"

type Received = Readonly<{
  headers: Record<string, string>
  body: string
}>

let server: ReturnType<typeof Bun.serve>
const received: Array<Received> = []

beforeAll(() => {
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const url = new URL(request.url)
      received.push({
        headers: Object.fromEntries(request.headers),
        body: await request.text()
      })
      if (url.pathname === "/busy")
        return new Response("slow down", {
          status: 429,
          headers: { "retry-after": "30" }
        })
      if (url.pathname === "/echo-secret")
        return new Response(
          `bad token tok_${"x".repeat(12)} and whsec_test1234`,
          {
            status: 401
          }
        )
      if (url.pathname === "/redirect")
        return new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/" }
        })
      if (url.pathname === "/big") return new Response("y".repeat(300_000))
      return new Response("ok", { status: 202 })
    }
  })
})

afterAll(() => {
  void server.stop(true)
})

const sender = (allowPrivate: boolean) =>
  Sender.layer.pipe(
    Layer.provide(
      Layer.succeed(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromUnknown({
          WEBHOOKS_ALLOW_PRIVATE_NETWORKS: allowPrivate ? "true" : "false"
        })
      )
    )
  )

const delivery = {
  id: "dlv_1",
  event: "ticket_created",
  body: JSON.stringify({ id: "dlv_1", type: "ticket_created" }),
  createdAt: DateTime.toDate(DateTime.makeUnsafe("2026-11-01T12:00:00Z"))
}
const target = (path: string) => ({
  url: `http://127.0.0.1:${server.port}${path}`,
  secret: "whsec_test1234",
  headers: [
    { name: "Authorization", value: `Bearer tok_${"x".repeat(12)}` },
    { name: "X-PP-Event", value: "spoofed" },
    { name: "Host", value: "evil.example" }
  ]
})

describe("WebhookSender", () => {
  it.effect("signs the exact body and sends the delivery headers", () =>
    Effect.gen(function* () {
      received.length = 0
      const send = yield* Sender.WebhookSender
      const result = yield* send.send(target("/hook"), delivery)
      expect(result).toEqual({
        _tag: "Response",
        status: 202,
        retryAfterSeconds: null,
        excerpt: "ok"
      })
      const [request] = received
      expect(request?.body).toBe(delivery.body)
      expect(request?.headers).toMatchObject({
        "content-type": "application/json",
        "x-pp-event": "ticket_created",
        "x-pp-delivery": "dlv_1",
        "x-pp-timestamp": "2026-11-01T12:00:00.000Z",
        "x-pp-signature-256": `sha256=${createHmac("sha256", "whsec_test1234").update(delivery.body).digest("hex")}`,
        authorization: `Bearer tok_${"x".repeat(12)}`,
        host: `127.0.0.1:${server.port}`
      })
    }).pipe(Effect.provide(sender(true)))
  )

  it.effect("reports Retry-After on busy receivers", () =>
    Effect.gen(function* () {
      const send = yield* Sender.WebhookSender
      const result = yield* send.send(target("/busy"), delivery)
      expect(result).toMatchObject({ status: 429, retryAfterSeconds: 30 })
    }).pipe(Effect.provide(sender(true)))
  )

  it.effect("redacts secrets the receiver echoes back", () =>
    Effect.gen(function* () {
      const send = yield* Sender.WebhookSender
      const result = yield* send.send(target("/echo-secret"), delivery)
      expect(result).toMatchObject({
        status: 401,
        excerpt: "bad token [redacted] and [redacted]"
      })
    }).pipe(Effect.provide(sender(true)))
  )

  it.effect("does not follow redirects", () =>
    Effect.gen(function* () {
      const send = yield* Sender.WebhookSender
      const result = yield* send.send(target("/redirect"), delivery)
      expect(result).toMatchObject({ _tag: "Response", status: 302 })
    }).pipe(Effect.provide(sender(true)))
  )

  it.effect("keeps at most 1 KiB of a large response", () =>
    Effect.gen(function* () {
      const send = yield* Sender.WebhookSender
      const result = yield* send.send(target("/big"), delivery)
      expect(result._tag === "Response" && result.excerpt?.length).toBe(1024)
    }).pipe(Effect.provide(sender(true)))
  )

  it.effect("refuses private addresses unless allowed", () =>
    Effect.gen(function* () {
      received.length = 0
      const send = yield* Sender.WebhookSender
      const result = yield* send.send(
        { ...target("/hook"), url: `https://127.0.0.1:${server.port}/hook` },
        delivery
      )
      expect(result).toEqual({ _tag: "Failure", reason: "blocked_address" })
      expect(received).toEqual([])
      expect(yield* send.check("https://localhost/hook")).toBe(
        "blocked_address"
      )
      expect(yield* send.check("http://example.com/hook")).toBe(
        "insecure_scheme"
      )
      expect(yield* send.check("https://user:pw@example.com/")).toBe(
        "credentials_in_url"
      )
      expect(yield* send.check("not a url")).toBe("invalid_url")
    }).pipe(Effect.provide(sender(false)))
  )

  it.effect("reports connection failures", () =>
    Effect.gen(function* () {
      const send = yield* Sender.WebhookSender
      const result = yield* send.send(
        { ...target("/hook"), url: "http://127.0.0.1:1/hook" },
        delivery
      )
      expect(result).toEqual({ _tag: "Failure", reason: "connection" })
    }).pipe(Effect.provide(sender(true)))
  )
})
