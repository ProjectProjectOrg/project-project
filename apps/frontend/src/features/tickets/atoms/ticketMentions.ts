import { DEFAULT_TICKET_SORT } from "@pp/shared"
import * as Atom from "effect/reactivity/Atom"

import { Keys, projectScope } from "@/api/keys"
import { query } from "@/api/query"

export type TicketMentionPageRequest = Readonly<{
  params: Readonly<{ orgSlug: string; slug: string }>
  q: string | undefined
  cursor: string | undefined
}>

export const ticketMentionPageRequest = (
  orgSlug: string,
  slug: string,
  q: string,
  cursor: string | null
): TicketMentionPageRequest => ({
  params: { orgSlug, slug },
  q: q === "" ? undefined : q,
  cursor: cursor ?? undefined
})

export const ticketMentionPage = Atom.family(
  (req: TicketMentionPageRequest) => {
    const scope = projectScope(req.params.orgSlug, req.params.slug)
    return query("tickets", "list", {
      params: req.params,
      query: { q: req.q, sort: DEFAULT_TICKET_SORT, cursor: req.cursor },
      timeToLive: "2 minutes",
      reactivityKeys: [
        Keys.ticketsIn(scope),
        Keys.ticketLists(scope),
        Keys.ticketTitleQuery(scope),
        Keys.orgMembers(req.params.orgSlug)
      ]
    })
  }
)
