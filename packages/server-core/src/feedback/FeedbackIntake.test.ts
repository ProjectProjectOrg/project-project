import { it } from "@effect/vitest"
import type { FeedbackReport } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Tracer from "effect/Tracer"
import { expect } from "vitest"

import { databaseLayer } from "../../test/database"
import { projectScope } from "../access/testing"
import * as Attachments from "../attachments/Attachments"
import { SystemProjects } from "../projects/SystemProjects"
import * as TicketCommands from "../tickets/TicketCommands"
import { FeedbackConfig } from "./FeedbackConfig"
import { FeedbackIntake } from "./FeedbackIntake"

const report: FeedbackReport = {
  id: "01a18200-0000-7000-8000-000000000000",
  kind: "bug",
  title: "Board drags stutter",
  description: "Dragging a card jumps back.",
  reporter: { name: "Ada", email: "ada@example.com" },
  instance: { url: "https://pp.example.com", version: "sha-abc1234" },
  context: { route: "/orgs/acme/projects/web", userAgent: "Firefox" },
  attachments: [],
  submittedAt: DateTime.toDateUtc(DateTime.makeUnsafe("2026-10-28T10:00:00Z"))
}

// A receipt that already has its ticket: receive only finishes it.
const FeedbackIntakeTest = FeedbackIntake.layer.pipe(
  Layer.provide([
    databaseLayer(({ sql }) =>
      Effect.succeed(sql.startsWith("select") ? [["FB-1", false, null]] : [])
    ),
    Layer.succeed(FeedbackConfig, {
      targetUrl: Option.none(),
      instanceUrl: "http://localhost:5173",
      version: Option.none(),
      intake: Option.some({
        orgSlug: "acme",
        projectName: "Feedback",
        projectKey: "FB"
      }),
      trustedProxyHops: 1
    }),
    Layer.succeed(SystemProjects, {
      ensure: () => Effect.succeed(projectScope("guest", "client"))
    }),
    Layer.mock(TicketCommands.TicketCommands, {}),
    Layer.mock(Attachments.Attachments, {}),
    FileSystem.layerNoop({})
  ])
)

it.effect("traces receive with its steps nested under it", () => {
  const spans: Array<Tracer.NativeSpan> = []
  const tracer = Tracer.make({
    span: (options) => {
      const span = new Tracer.NativeSpan(options)
      spans.push(span)
      return span
    }
  })
  return Effect.gen(function* () {
    const intake = yield* FeedbackIntake
    yield* intake.receive(report, [])
    expect(
      spans.flatMap((span) =>
        span.name.startsWith("FeedbackIntake.")
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
      { name: "FeedbackIntake.receive", parent: null },
      { name: "FeedbackIntake.openReceipt", parent: "FeedbackIntake.receive" },
      { name: "FeedbackIntake.finish", parent: "FeedbackIntake.receive" }
    ])
  }).pipe(Effect.withTracer(tracer), Effect.provide(FeedbackIntakeTest))
})
