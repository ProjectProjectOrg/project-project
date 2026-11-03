import { it } from "@effect/vitest"
import { type LiveEvent, TicketId } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import { afterEach, describe, expect, vi } from "vitest"

import { clientId } from "@/api/clientId"
import { Keys, projectScope } from "@/api/keys"
import { liveFresh } from "@/api/liveFreshness"
import { query } from "@/api/query"
import { stubFetch } from "@/api/testFetch"
import { openInteractions } from "@/lib/interactions"

import { liveUpdates } from "./liveUpdates"

const fetch = stubFetch()

const encoder = new TextEncoder()

const openEventStream = () => {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined
  return {
    response: () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start: (c) => {
            controller = c
          }
        }),
        { headers: { "content-type": "text/event-stream" } }
      ),
    send: (event: LiveEvent) =>
      controller?.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)),
    drop: () => controller?.close()
  }
}

const ticketChange = (origin: string | null): LiveEvent => ({
  kind: "ticket",
  orgSlug: "acme",
  slug: "web",
  id: TicketId.make("T-1"),
  origin,
  cursor: "e.1"
})

const countQuery = query("tickets", "count", {
  params: { orgSlug: "acme", slug: "web" },
  query: {},
  reactivityKeys: [Keys.ticketsIn(projectScope("acme", "web"))],
  timeToLive: "2 minutes"
})

let registry = AtomRegistry.make()

afterEach(() => {
  registry.dispose()
  registry = AtomRegistry.make()
})

const settle = Effect.sleep("400 millis")

const eventually = (assertion: () => void) =>
  Effect.promise(() => vi.waitFor(assertion, { timeout: 3000 }))

const heartbeat: LiveEvent = { kind: "heartbeat", cursor: "e.0" }

const serveCounts = (failedConnections = 0) => {
  const events = openEventStream()
  const counts = vi.fn<() => Promise<Response>>(() =>
    Promise.resolve(Response.json({ total: 0, byStatus: {} }))
  )
  let opened = 0
  const connections = vi.fn<(url: string) => Promise<Response>>(() => {
    opened += 1
    return Promise.resolve(
      opened <= failedConnections
        ? new Response(null, { status: 503 })
        : events.response()
    )
  })
  fetch.set((input) => {
    const url = String(input instanceof Request ? input.url : input)
    return url.includes("/events") ? connections(url) : counts()
  })
  return { events, counts, connections }
}

describe("liveUpdates", () => {
  it.live(
    "refetches views another writer changed, once per burst, skips its own echoes, resyncs every view when the server asks, and refetches nothing extra after a reconnect the server could replay",
    () =>
      Effect.gen(function* () {
        const { events, counts, connections } = serveCounts()

        registry.mount(countQuery)
        yield* eventually(() =>
          expect(AsyncResult.isSuccess(registry.get(countQuery))).toBe(true)
        )
        registry.mount(liveUpdates)
        yield* settle
        events.send(heartbeat)
        yield* settle
        expect(counts).toHaveBeenCalledTimes(1)

        events.send(ticketChange("other-tab"))
        yield* eventually(() => expect(counts).toHaveBeenCalledTimes(2))

        events.send(ticketChange(clientId))
        yield* settle
        expect(counts).toHaveBeenCalledTimes(2)

        for (let i = 0; i < 5; i++) events.send(ticketChange(null))
        yield* settle
        expect(counts).toHaveBeenCalledTimes(3)

        events.send({ kind: "resync", cursor: "e.2" })
        yield* eventually(() => expect(counts).toHaveBeenCalledTimes(4))

        events.drop()
        yield* eventually(() => expect(connections).toHaveBeenCalledTimes(2))
        events.send(heartbeat)
        yield* settle
        expect(counts).toHaveBeenCalledTimes(4)

        events.send(ticketChange("other-tab"))
        yield* eventually(() => expect(counts).toHaveBeenCalledTimes(5))
      })
  )

  it.live(
    "backs off before reconnecting when the server closes the stream cleanly",
    () =>
      Effect.gen(function* () {
        const { events, connections } = serveCounts()
        registry.mount(liveUpdates)
        yield* eventually(() => expect(connections).toHaveBeenCalledTimes(1))
        events.send(heartbeat)

        events.drop()
        yield* Effect.sleep("300 millis")
        expect(connections).toHaveBeenCalledTimes(1)
        yield* eventually(() => expect(connections).toHaveBeenCalledTimes(2))
      })
  )

  it.live(
    "resyncs every view once it finally connects after the first attempt failed",
    () =>
      Effect.gen(function* () {
        const { events, counts, connections } = serveCounts(1)

        registry.mount(countQuery)
        yield* eventually(() =>
          expect(AsyncResult.isSuccess(registry.get(countQuery))).toBe(true)
        )
        registry.mount(liveUpdates)
        yield* eventually(() => expect(connections).toHaveBeenCalledTimes(2))
        expect(counts).toHaveBeenCalledTimes(1)

        events.send(heartbeat)
        yield* eventually(() => expect(counts).toHaveBeenCalledTimes(2))
      }),
    { timeout: 10_000 }
  )

  it.live(
    "holds remote changes while a menu or drag is open and refetches once when it closes",
    () =>
      Effect.gen(function* () {
        const { events, counts } = serveCounts()

        registry.mount(countQuery)
        yield* eventually(() =>
          expect(AsyncResult.isSuccess(registry.get(countQuery))).toBe(true)
        )
        registry.set(openInteractions, 1)
        registry.mount(liveUpdates)
        yield* settle

        events.send(ticketChange("other-tab"))
        yield* settle
        events.send(ticketChange("other-tab"))
        yield* settle
        expect(counts).toHaveBeenCalledTimes(1)

        registry.set(openInteractions, 0)
        yield* eventually(() => expect(counts).toHaveBeenCalledTimes(2))
        yield* settle
        expect(counts).toHaveBeenCalledTimes(2)
      })
  )

  it.live(
    "reconnects from the last cursor it saw and is fresh only while connected",
    () =>
      Effect.gen(function* () {
        const { events, connections } = serveCounts()
        registry.mount(liveUpdates)
        yield* eventually(() => expect(connections).toHaveBeenCalledTimes(1))
        expect(connections.mock.calls[0]?.[0]).not.toContain("after=")
        expect(registry.get(liveFresh)).toBe(false)

        events.send({ kind: "heartbeat", cursor: "e.41" })
        yield* eventually(() => expect(registry.get(liveFresh)).toBe(true))

        events.drop()
        yield* eventually(() => expect(registry.get(liveFresh)).toBe(false))
        yield* eventually(() => expect(connections).toHaveBeenCalledTimes(2))
        expect(connections.mock.calls[1]?.[0]).toContain("after=e.41")
      })
  )
})
