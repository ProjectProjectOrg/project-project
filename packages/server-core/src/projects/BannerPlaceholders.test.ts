import { it } from "@effect/vitest"
import { Db } from "@pp/db"
import * as Effect from "effect/Effect"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Tracer from "effect/Tracer"
import { expect } from "vitest"

import { OrgStorage } from "../storage/OrgStorage"
import { S3Storage } from "../storage/S3Storage"
import * as BannerPlaceholders from "./BannerPlaceholders"

const layer = BannerPlaceholders.layer.pipe(
  // ensure never reaches the database for a banner without an attachment
  Layer.provide(Layer.succeed(Db, {} as Db["Service"])),
  Layer.provide(Layer.mock(OrgStorage, {})),
  Layer.provide(Layer.mock(S3Storage, {})),
  Layer.provide(Layer.succeed(FetchHttpClient.Fetch, globalThis.fetch))
)

it.effect("traces ensure under its own BannerPlaceholders span", () => {
  const spans: Array<Tracer.NativeSpan> = []
  const tracer = Tracer.make({
    span: (options) => {
      const span = new Tracer.NativeSpan(options)
      spans.push(span)
      return span
    }
  })
  return Effect.gen(function* () {
    const placeholders = yield* BannerPlaceholders.BannerPlaceholders
    const banner = yield* placeholders
      .ensure("acme", "web", null)
      .pipe(Effect.withTracer(tracer))
    expect(banner).toBeNull()
    expect(
      spans.map((span) => ({
        name: span.name,
        root: Option.isNone(span.parent)
      }))
    ).toEqual([{ name: "BannerPlaceholders.ensure", root: true }])
  }).pipe(Effect.provide(layer))
})
