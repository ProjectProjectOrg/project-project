import { expect, it } from "@effect/vitest"
import { projectScope } from "@pp/server-core/access/testing"
import * as TicketActivityFeed from "@pp/server-core/activity/TicketActivityFeed"
import * as Comments from "@pp/server-core/comments/Comments"
import * as TicketSubscriptions from "@pp/server-core/subscriptions/TicketSubscriptions"
import * as TicketQueries from "@pp/server-core/tickets/TicketQueries"
import { NotFound, ProjectScope, TicketId } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import { contentBundle } from "./contentBundle"

const readable = TicketId.make("T-1")
const gone = TicketId.make("T-2")

const services = Layer.mergeAll(
  Layer.mock(TicketQueries.TicketQueries, {}),
  Layer.mock(TicketActivityFeed.TicketActivityFeed, {}),
  Layer.mock(Comments.Comments, {
    list: (id) =>
      id === readable ? Effect.succeed([]) : Effect.fail(new NotFound())
  }),
  Layer.mock(TicketSubscriptions.TicketSubscriptions, {
    list: (id) =>
      id === readable
        ? Effect.succeed({ subscribed: false, subscribers: [] })
        : Effect.fail(new NotFound())
  }),
  Layer.succeed(ProjectScope, projectScope("member", "developer"))
)

it.effect(
  "answers each kind per ticket and marks unreadable ones missing",
  () =>
    Effect.gen(function* () {
      const lines = yield* contentBundle({
        ids: [readable, gone],
        kinds: ["Comments", "Subscribers"]
      })
      expect(lines).toEqual([
        {
          _tag: "Found",
          id: readable,
          content: { _tag: "Comments", value: [] }
        },
        {
          _tag: "Found",
          id: readable,
          content: {
            _tag: "Subscribers",
            value: { subscribed: false, subscribers: [] }
          }
        },
        { _tag: "Missing", id: gone, kind: "Comments" },
        { _tag: "Missing", id: gone, kind: "Subscribers" }
      ])
    }).pipe(Effect.provide(services))
)
