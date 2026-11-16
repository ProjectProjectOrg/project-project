import type { TicketSubscribers, TicketId } from "@pp/shared"
import * as Atom from "effect/reactivity/Atom"

import { Keys, projectScope } from "@/api/keys"
import { query } from "@/api/query"
import { viewMutation } from "@/api/viewMutation"

export type TicketSubscribersRequest = Readonly<{
  _view: "ticketSubscribers"
  params: Readonly<{ orgSlug: string; slug: string; id: TicketId }>
}>

export const ticketSubscribersRequest = (
  orgSlug: string,
  slug: string,
  id: TicketId
): TicketSubscribersRequest => ({
  _view: "ticketSubscribers",
  params: { orgSlug, slug, id }
})

const subscribersQuery = (req: TicketSubscribersRequest) => {
  const scope = projectScope(req.params.orgSlug, req.params.slug)
  return query("ticketSubscriptions", "list", {
    params: req.params,
    timeToLive: "2 minutes",
    reactivityKeys: [
      Keys.ticket(scope, req.params.id),
      Keys.ticketComments(scope)
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
    confirm: (_current, confirmed) => confirmed
  })
)
