// @effect-diagnostics-next-line nodeBuiltinImport:off
import { randomUUID } from "node:crypto"

import { PgClient } from "@effect/sql-pg"
import { it } from "@effect/vitest"
import { DbLive, migrationsFolder } from "@pp/db"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import * as Effect from "effect/Effect"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Redacted from "effect/Redacted"
import * as Tracer from "effect/Tracer"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect } from "vitest"

import * as LinkPreviews from "./LinkPreviews"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

type Route = (url: string) => Response

const fakeFetch = (route: Route) => {
  const requested: Array<string> = []
  const fetch = (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input)
    requested.push(url)
    return Promise.resolve(route(url))
  }
  return { requested, fetch: Object.assign(fetch, { preconnect: () => {} }) }
}

const html = (body: string) =>
  new Response(body, {
    headers: { "content-type": "text/html; charset=utf-8" }
  })

const icon = () =>
  new Response(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="12" fill="#24292e"/></svg>',
    { headers: { "content-type": "image/svg+xml" } }
  )

describe.skipIf(!databaseUrl)("LinkPreviews", () => {
  const origin = "http://93.184.216.34"
  let pool: Pool
  let layer: Layer.Layer<LinkPreviews.LinkPreviews>

  const preview = (url: string, fetch: ReturnType<typeof fakeFetch>["fetch"]) =>
    Effect.flatMap(LinkPreviews.LinkPreviews, (linkPreviews) =>
      linkPreviews.get(url)
    ).pipe(
      Effect.provide(layer),
      Effect.provideService(FetchHttpClient.Fetch, fetch)
    )

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Test database URL is required")
    const url = new URL(databaseUrl)
    if (
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      !url.pathname.startsWith("/projectproject_effect_v4_")
    ) {
      throw new Error("Test requires an isolated local database")
    }
    pool = new Pool({ connectionString: databaseUrl })
    await migrate(drizzle({ client: pool }), { migrationsFolder })
    layer = LinkPreviews.layer.pipe(
      Layer.provide(DbLive),
      Layer.provide(
        PgClient.layer({ url: Redacted.make(databaseUrl), maxConnections: 1 })
      ),
      Layer.orDie
    )
  })

  afterAll(async () => {
    await pool?.end()
  })

  it.effect(
    "never requests a private address that a public page redirects to",
    () =>
      Effect.gen(function* () {
        const page = `${origin}/${randomUUID()}`
        const network = fakeFetch((url) =>
          url === page
            ? new Response(null, {
                status: 302,
                headers: { location: "http://169.254.169.254/latest/meta-data" }
              })
            : html("<title>Secret</title>")
        )

        const result = yield* preview(page, network.fetch)

        expect(network.requested).toEqual([page])
        expect(result).toEqual({
          url: page,
          title: null,
          faviconUrl: null,
          faviconRendering: "original"
        })
      })
  )

  it.effect("traces get under its own span", () => {
    const spans: Array<Tracer.NativeSpan> = []
    const tracer = Tracer.make({
      span: (options) => {
        const span = new Tracer.NativeSpan(options)
        spans.push(span)
        return span
      }
    })
    return Effect.gen(function* () {
      const network = fakeFetch(() => html("<title>Example</title>"))
      yield* preview(`${origin}/${randomUUID()}`, network.fetch)
      expect(
        spans.flatMap((span) =>
          Option.isNone(span.parent) && span.name.startsWith("LinkPreviews.")
            ? [span.name]
            : []
        )
      ).toEqual(["LinkPreviews.get"])
    }).pipe(Effect.withTracer(tracer))
  })

  it.effect("serves a cached preview without fetching the page again", () =>
    Effect.gen(function* () {
      const page = `${origin}/${randomUUID()}`
      const network = fakeFetch((url) =>
        url === page
          ? html(
              `<head><title>Example</title><link rel="icon" href="/icon.svg"></head>`
            )
          : icon()
      )

      const first = yield* preview(page, network.fetch)
      const second = yield* preview(`${page}#section`, network.fetch)

      expect(first).toEqual({
        url: page,
        title: "Example",
        faviconUrl: `${origin}/icon.svg`,
        faviconRendering: "monochrome"
      })
      expect(second).toEqual(first)
      expect(network.requested).toEqual([page, `${origin}/icon.svg`])
    })
  )
  it.effect("never follows a favicon redirect to a private address", () =>
    Effect.gen(function* () {
      const page = `${origin}/${randomUUID()}`
      const favicon = `${origin}/${randomUUID()}.svg`
      const network = fakeFetch((url) =>
        url === page
          ? html(`<title>Example</title><link rel="icon" href="${favicon}">`)
          : new Response(null, {
              status: 302,
              headers: { location: "http://169.254.169.254/icon.svg" }
            })
      )
      const result = yield* preview(page, network.fetch)
      expect(result).toEqual({
        url: page,
        title: "Example",
        faviconUrl: favicon,
        faviconRendering: "original"
      })
      expect(network.requested).toEqual([page, favicon])
    })
  )

  it.effect("stops reading oversized favicons and keeps the page preview", () =>
    Effect.gen(function* () {
      const page = `${origin}/${randomUUID()}`
      let cancelled = false
      const network = fakeFetch((url) =>
        url === page
          ? html('<title>Example</title><link rel="icon" href="/large.svg">')
          : new Response(
              new ReadableStream({
                pull: (controller) =>
                  controller.enqueue(new Uint8Array(256 * 1024 + 1)),
                cancel: () => {
                  cancelled = true
                }
              })
            )
      )
      const result = yield* preview(page, network.fetch)
      expect(result).toEqual({
        url: page,
        title: "Example",
        faviconUrl: `${origin}/large.svg`,
        faviconRendering: "original"
      })
      expect(cancelled).toBe(true)
    })
  )

  it.effect(
    "classifies an existing cached icon once without refetching its page",
    () =>
      Effect.gen(function* () {
        const page = `${origin}/${randomUUID()}`
        const favicon = `${origin}/${randomUUID()}.svg`
        yield* Effect.promise(() =>
          pool.query(
            "INSERT INTO link_preview (url, title, favicon_url, fetched_at) VALUES ($1, $2, $3, now())",
            [page, "Cached", favicon]
          )
        )
        const network = fakeFetch(() => icon())
        const first = yield* preview(page, network.fetch)
        const second = yield* preview(page, network.fetch)
        expect(first).toEqual({
          url: page,
          title: "Cached",
          faviconUrl: favicon,
          faviconRendering: "monochrome"
        })
        expect(second).toEqual(first)
        expect(network.requested).toEqual([favicon])
      })
  )
})
