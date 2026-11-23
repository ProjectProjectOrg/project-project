import type { TicketSubscribers, TicketId } from "@pp/shared"
import * as Atom from "effect/reactivity/Atom"

import { Keys, projectScope } from "@/api/keys"
import { query } from "@/api/query"
import { viewMutation } from "@/api/viewMutation"
import { ticketContentKey } from "@/features/tickets/lib/ticketContent"

export type TicketSubscribersRequest = ReturnType<
  typeof ticketSubscribersRequest
>

export const ticketSubscribersRequest = (
  orgSlug: string,
  slug: string,
  id: TicketId
) =>
  ({
    _view: "ticketSubscribers",
    params: { orgSlug, slug, id }
  }) as const

export const subscribersQuery = (req: TicketSubscribersRequest) => {
  const scope = projectScope(req.params.orgSlug, req.params.slug)
  return query("ticketSubscriptions", "list", {
    params: req.params,
    serializationKey: ticketContentKey(req.params),
    reactivityKeys: [
      Keys.ticket(scope, req.params.id),
      Keys.projectResync(scope),
      Keys.ticketSubscribers(scope, req.params.id)
    ]
  })
}

export const ticketSubscribers = Atom.family((req: TicketSubscribersRequest) =>
  Atom.optimistic(subscribersQuery(req))
)

export const setSubscribed = Atom.family((req: TicketSubscribersRequest) =>
  viewMutation(ticketSubscribers(req), {
    name: "setSubscribed",
    predict: (current: TicketSubscribers, subscribed: boolean) => ({
      ...current,
      subscribed
    }),
    call: (client, subscribed) =>
      subscribed
        ? client.ticketSubscriptions.subscribe({ params: req.params })
        : client.ticketSubscriptions.unsubscribe({ params: req.params }),
    confirm: (_current, confirmed) => confirmed,
    publish: () => [
      Keys.ticketSubscribers(
        projectScope(req.params.orgSlug, req.params.slug),
        req.params.id
      )
    ]
  })
)
