import { TicketActivityEntry, type TicketId } from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import * as Schema from "effect/Schema"

import { Keys, projectScope } from "@/api/keys"
import { query } from "@/api/query"
import { locallyCached } from "@/features/local/atoms/localTicketData"

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

const TicketActivityView = Schema.Struct({
  items: Schema.Array(TicketActivityEntry),
  hasOlder: Schema.Boolean
})
export type TicketActivityView = typeof TicketActivityView.Type

const scopeOf = (req: TicketActivityRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

const pageQuery = (req: TicketActivityRequest, cursor: string | null) =>
  query("ticketActivity", "list", {
    params: req.params,
    query: cursor === null ? {} : { cursor },
    timeToLive: "5 minutes",
    reactivityKeys: [
      Keys.ticket(scopeOf(req), req.params.id),
      Keys.sprintMembership(scopeOf(req))
    ]
  })

export const olderActivityPages = Atom.family((_req: TicketActivityRequest) =>
  Atom.make(0).pipe(Atom.setIdleTTL("10 minutes"))
)

const activityPages = (req: TicketActivityRequest) =>
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
      let older = get(olderActivityPages(req))
      while (nextCursor !== null && older > 0) {
        const page = get(pageQuery(req, nextCursor))
        waiting ||= page.waiting
        if (!AsyncResult.isSuccess(page)) break
        items.push(...page.value.items)
        nextCursor = page.value.nextCursor
        older -= 1
      }
      return AsyncResult.success<TicketActivityView>(
        { items, hasOlder: nextCursor !== null },
        { waiting }
      )
    },
    (refresh) => refresh(pageQuery(req, null))
  )

export const ticketActivity = Atom.family((req: TicketActivityRequest) =>
  locallyCached(
    { ...req.params, ticket: req.params.id, kind: "activity" },
    TicketActivityView
  )(activityPages(req))
)
