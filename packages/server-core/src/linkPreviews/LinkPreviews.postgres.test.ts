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
        expect(result).toEqual({ url: page, title: null, faviconUrl: null })
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
      const network = fakeFetch(() =>
        html(
          `<head><title>Example</title><link rel="icon" href="/icon.png"></head>`
        )
      )

      const first = yield* preview(page, network.fetch)
      const second = yield* preview(`${page}#section`, network.fetch)

      expect(first).toEqual({
        url: page,
        title: "Example",
        faviconUrl: `${origin}/icon.png`
      })
      expect(second).toEqual(first)
      expect(network.requested).toEqual([page])
    })
  )
})
