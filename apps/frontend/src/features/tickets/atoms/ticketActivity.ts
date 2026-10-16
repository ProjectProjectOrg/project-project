import type { TicketActivityEntry, TicketId, User } from "@pp/shared"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"

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
  people: ReadonlyArray<User>
  hasOlder: boolean
}>

const scopeOf = (req: TicketActivityRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

const pageQuery = (req: TicketActivityRequest, cursor: string | null) =>
  Api.query("ticketActivity", "list", {
    params: req.params,
    query: cursor === null ? {} : { cursor },
    timeToLive: "5 minutes",
    reactivityKeys: [
      Keys.ticket(scopeOf(req), req.params.id),
      Keys.ticketHistory(scopeOf(req), req.params.id),
      Keys.sprintMembership(scopeOf(req))
    ]
  })

export const olderActivityPages = Atom.family((_req: TicketActivityRequest) =>
  Atom.make(0).pipe(Atom.setIdleTTL("5 minutes"))
)

const emptyView: TicketActivityView = { items: [], people: [], hasOlder: false }

export const ticketActivity = Atom.family((req: TicketActivityRequest) => {
  let loadedCursors: ReadonlyArray<string | null> = [null]
  return Atom.readable(
    (get) => {
      const first = get(pageQuery(req, null))
      if (!AsyncResult.isSuccess(first)) {
        loadedCursors = [null]
        return AsyncResult.map(first, () => emptyView)
      }
      const cursors: Array<string | null> = [null]
      const items = [...first.value.items]
      const people = [...first.value.people]
      let nextCursor = first.value.nextCursor
      let waiting = first.waiting
      const depth = get(olderActivityPages(req))
      for (let index = 0; index < depth && nextCursor !== null; index++) {
        cursors.push(nextCursor)
        const page = get(pageQuery(req, nextCursor))
        waiting ||= page.waiting
        if (AsyncResult.isFailure(page)) {
          loadedCursors = cursors
          return AsyncResult.map(page, () => emptyView)
        }
        if (!AsyncResult.isSuccess(page)) break
        items.push(...page.value.items)
        people.push(...page.value.people)
        nextCursor = page.value.nextCursor
      }
      loadedCursors = cursors
      return AsyncResult.success<TicketActivityView>(
        { items, people, hasOlder: nextCursor !== null },
        { waiting }
      )
    },
    (refresh) => {
      for (const cursor of loadedCursors) refresh(pageQuery(req, cursor))
    }
  )
})
