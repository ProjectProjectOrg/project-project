import { it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Tracer from "effect/Tracer"
import { expect } from "vitest"

import { databaseLayer } from "../../test/database"
import { Bots } from "./Bots"
import { BotsLive } from "./BotsLive"

const bot = { key: "feedback", name: "Feedback", role: "client" } as const

const BotsTest = BotsLive.pipe(
  Layer.provide(
    databaseLayer(({ sql }) =>
      Effect.succeed(sql.startsWith("select") ? [["project-1", "org-1"]] : [])
    )
  )
)

it.effect("traces projectScope with ensure nested under it", () => {
  const spans: Array<Tracer.NativeSpan> = []
  const tracer = Tracer.make({
    span: (options) => {
      const span = new Tracer.NativeSpan(options)
      spans.push(span)
      return span
    }
  })
  return Effect.gen(function* () {
    const bots = yield* Bots
    const scope = yield* bots.projectScope(bot, "acme", "feedback")
    expect(scope).toMatchObject({
      userId: "bot_feedback",
      organizationId: "org-1",
      projectId: "project-1",
      role: "client"
    })
    expect(
      spans.flatMap((span) =>
        span.name.startsWith("Bots.")
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
      { name: "Bots.projectScope", parent: null },
      { name: "Bots.ensure", parent: "Bots.projectScope" }
    ])
  }).pipe(Effect.withTracer(tracer), Effect.provide(BotsTest))
})
