import type {
  GroupId,
  TicketId,
  TicketSearchQuery,
  TicketTextHit,
  TicketTitle
} from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"

import { Keys, projectScope } from "@/api/keys"
import { query } from "@/api/query"
import { localTitles } from "@/features/local/atoms/localViews"
import { readLocal } from "@/features/local/atoms/readLocal"

export type TicketSearchOptions = Readonly<{
  q?: string
  excludeGroupId?: GroupId
  attachableTo?: TicketId
  limit?: number
}>

export type SearchRequest = Readonly<{
  params: Readonly<{ orgSlug: string; slug: string }>
  query: TicketSearchQuery
}>

export const searchRequest = (
  orgSlug: string,
  slug: string,
  options: TicketSearchOptions
): SearchRequest => ({
  params: { orgSlug, slug },
  query: options
})

export const ticketSearch = Atom.family((req: SearchRequest) => {
  const scope = projectScope(req.params.orgSlug, req.params.slug)
  return query("tickets", "search", {
    params: req.params,
    query: req.query,
    timeToLive: "2 minutes",
    reactivityKeys: [
      Keys.ticketsIn(scope),
      Keys.ticketLists(scope),
      Keys.ticketTitleQuery(scope),
      Keys.orgMembers(req.params.orgSlug)
    ]
  })
})

export const ticketTextSearch = Atom.family(
  (req: Readonly<{ params: SearchRequest["params"]; q: string }>) => {
    const scope = projectScope(req.params.orgSlug, req.params.slug)
    return query("tickets", "textSearch", {
      params: req.params,
      query: { q: req.q },
      timeToLive: "2 minutes",
      reactivityKeys: [Keys.ticketsIn(scope), Keys.ticketLists(scope)]
    })
  }
)

const titlesQuery = (params: SearchRequest["params"]) => {
  const scope = projectScope(params.orgSlug, params.slug)
  return query("tickets", "titles", {
    params,
    timeToLive: "2 minutes",
    reactivityKeys: [
      Keys.ticketsIn(scope),
      Keys.ticketLists(scope),
      Keys.ticketTitleQuery(scope)
    ]
  })
}

export const ticketTitles = Atom.family((params: SearchRequest["params"]) =>
  Atom.readable(
    (get) =>
      readLocal(get, params, () => localTitles(params)) ??
      get(titlesQuery(params)),
    (refresh) => refresh(titlesQuery(params))
  )
)

export const idleTicketTitles: ReturnType<typeof ticketTitles> = Atom.make(
  AsyncResult.success<ReadonlyArray<TicketTitle>>([])
)

export const idleTicketTextSearch: ReturnType<typeof ticketTextSearch> =
  Atom.make(AsyncResult.success<ReadonlyArray<TicketTextHit>>([]))
