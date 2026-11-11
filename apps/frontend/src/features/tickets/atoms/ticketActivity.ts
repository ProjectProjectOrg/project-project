import type { TicketActivityEntry, TicketId } from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"

import { Keys, projectScope } from "@/api/keys"
import { query } from "@/api/query"

export type TicketActivityRequest = Readonly<{
  params: Readonly<{
    orgSlug: string
    slug: string
    id: TicketId
  }>
}>

export const ticketActivityRequest = (
  orgSlug: string,
  slug: string,
  id: TicketId
): TicketActivityRequest => ({ params: { orgSlug, slug, id } })

export type TicketActivityView = Readonly<{
  items: ReadonlyArray<TicketActivityEntry>
  hasOlder: boolean
}>

const scopeOf = (req: TicketActivityRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

const pageQuery = (req: TicketActivityRequest, cursor: string | null) =>
  query("ticketActivity", "list", {
    params: req.params,
    query: cursor === null ? {} : { cursor },
    timeToLive: "5 minutes",
    reactivityKeys: [
      Keys.ticketsIn(scopeOf(req)),
      Keys.sprintMembership(scopeOf(req))
    ]
  })

export const ticketActivity = Atom.family((req: TicketActivityRequest) =>
  Atom.readable(
    (get) => {
      const first = get(pageQuery(req, null))
      if (!AsyncResult.isSuccess(first)) {
        return AsyncResult.map(
          first,
          (): TicketActivityView => ({ items: [], hasOlder: false })
        )
      }
      const items = [...first.value.items]
      let nextCursor = first.value.nextCursor
      let waiting = first.waiting
      while (nextCursor !== null) {
        const page = get(pageQuery(req, nextCursor))
        waiting ||= page.waiting
        if (!AsyncResult.isSuccess(page)) break
        items.push(...page.value.items)
        nextCursor = page.value.nextCursor
      }
      return AsyncResult.success<TicketActivityView>(
        { items, hasOlder: nextCursor !== null },
        { waiting }
      )
    },
    (refresh) => refresh(pageQuery(req, null))
  )
)
