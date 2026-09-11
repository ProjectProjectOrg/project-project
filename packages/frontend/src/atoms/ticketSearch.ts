import * as Atom from "effect/unstable/reactivity/Atom"
import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"

export interface TicketSearchOptions {
  readonly q?: string
  readonly excludeGroupId?: string
  readonly limit?: number
}

export interface SearchRequest {
  readonly params: { readonly orgSlug: string; readonly slug: string }
  readonly query: Record<string, string>
}

export const searchRequest = (
  orgSlug: string,
  slug: string,
  options: TicketSearchOptions
): SearchRequest => ({
  params: { orgSlug, slug },
  query: {
    ...(options.q ? { q: options.q } : {}),
    ...(options.excludeGroupId
      ? { excludeGroupId: options.excludeGroupId }
      : {}),
    ...(options.limit ? { limit: String(options.limit) } : {})
  }
})

export const ticketSearch = Atom.family((req: SearchRequest) => {
  const scope = projectScope(req.params.orgSlug, req.params.slug)
  return Api.query("tickets", "search", {
    params: req.params,
    query: req.query,
    timeToLive: "2 minutes",
    reactivityKeys: [
      Keys.ticketsIn(scope),
      Keys.ticketLists(scope),
      Keys.ticketTitleQuery(scope)
    ]
  })
})
