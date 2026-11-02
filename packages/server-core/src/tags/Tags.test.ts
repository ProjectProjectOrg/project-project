import { it } from "@effect/vitest"
import { ActivityActor, NotFound, ProjectScope } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Tracer from "effect/Tracer"
import { expect } from "vitest"

import { databaseLayer } from "../../test/database"
import { projectScope } from "../access/testing"
import * as TicketRewrites from "../tickets/TicketRewrites"
import * as Tags from "./Tags"

const TagsTest = Tags.layer.pipe(
  Layer.provide([
    databaseLayer(() => Effect.succeed([])),
    Layer.mock(TicketRewrites.TicketRewrites, {})
  ])
)

it.effect("traces each call under its own span", () => {
  const spans: Array<Tracer.NativeSpan> = []
  const tracer = Tracer.make({
    span: (options) => {
      const span = new Tracer.NativeSpan(options)
      spans.push(span)
      return span
    }
  })
  return Effect.gen(function* () {
    const tags = yield* Tags.Tags
    yield* tags.listPaged(undefined, 10)
    expect(yield* Effect.flip(tags.remove("bug"))).toStrictEqual(new NotFound())
    expect(
      spans.flatMap((span) =>
        span.name.startsWith("Tags.")
          ? [
              {
                name: span.name,
                parent: Option.match(span.parent, {
                  onNone: () => null,
                  onSome: (parent) => ("name" in parent ? parent.name : null)
                })
              }
            ]
          : []
      )
    ).toEqual([
      { name: "Tags.listPaged", parent: null },
      { name: "Tags.list", parent: "Tags.listPaged" },
      { name: "Tags.remove", parent: null }
    ])
  }).pipe(
    Effect.withTracer(tracer),
    Effect.provideService(ProjectScope, projectScope("member", "pm")),
    Effect.provideService(ActivityActor, ActivityActor.user("user-1")),
    Effect.provide(TagsTest)
  )
})
