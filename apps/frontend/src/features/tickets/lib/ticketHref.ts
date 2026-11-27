import type { TicketId } from "@pp/shared"

import { stringifySearch } from "@/lib/searchParams"

import type { TicketNavigationSearch } from "./ticketSearch"

const queries = new WeakMap<TicketNavigationSearch, string>()

const queryOf = (search: TicketNavigationSearch) => {
  const known = queries.get(search)
  if (known !== undefined) return known
  const query = stringifySearch(search)
  queries.set(search, query)
  return query
}

export const ticketHref = (
  orgSlug: string,
  slug: string,
  id: TicketId,
  search: TicketNavigationSearch | undefined
) =>
  `/orgs/${encodeURIComponent(orgSlug)}/projects/${encodeURIComponent(slug)}/tickets/${encodeURIComponent(id)}${search === undefined ? "" : queryOf(search)}`
