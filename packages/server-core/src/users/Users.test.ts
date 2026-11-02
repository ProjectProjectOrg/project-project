import { it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Tracer from "effect/Tracer"
import { expect } from "vitest"

import { databaseLayer } from "../../test/database"
import * as Users from "./Users"

const UsersTest = Users.layer.pipe(
  Layer.provide(databaseLayer(() => Effect.succeed([])))
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
    const users = yield* Users.Users
    expect(yield* users.findByEmail("ada@example.test")).toBeNull()
    expect(yield* users.findManyByIds([])).toEqual([])
    expect(yield* users.fullByIds(["user-1"])).toEqual([])
    expect(
      spans.flatMap((span) => (Option.isNone(span.parent) ? [span.name] : []))
    ).toEqual(["Users.findByEmail", "Users.findManyByIds", "Users.fullByIds"])
  }).pipe(Effect.withTracer(tracer), Effect.provide(UsersTest))
})
