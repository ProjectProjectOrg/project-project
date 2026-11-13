import * as TicketSubscriptions from "@pp/server-core/subscriptions/TicketSubscriptions"
import { AppApi } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/http-api"

export const TicketSubscriptionsHandlerLive = HttpApiBuilder.group(
  AppApi,
  "ticketSubscriptions",
  (handlers) =>
    handlers
      .handle("list", ({ params }) =>
        Effect.flatMap(
          TicketSubscriptions.TicketSubscriptions,
          (subscriptions) => subscriptions.list(params.id)
        )
      )
      .handle("subscribe", ({ params }) =>
        Effect.flatMap(
          TicketSubscriptions.TicketSubscriptions,
          (subscriptions) => subscriptions.setSubscribed(params.id, true)
        )
      )
      .handle("unsubscribe", ({ params }) =>
        Effect.flatMap(
          TicketSubscriptions.TicketSubscriptions,
          (subscriptions) => subscriptions.setSubscribed(params.id, false)
        )
      )
)
