import type { TicketActivityEntry, TicketId } from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { query } from "@/api/query"

import { ticketContentKey } from "../lib/ticketContent"
import { ticketRequest, updateTicketDetail } from "./ticketDetail"

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
) => ({ params: { orgSlug, slug, id } })

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
    serializationKey: cursor === null ? ticketContentKey(req.params) : undefined
  })

const refreshActivity = Atom.family((req: TicketActivityRequest) => {
  const { orgSlug, slug, id } = req.params
  const changed = Atom.readable(() => Symbol()).pipe(
    Api.runtime.factory.withReactivity([
      Keys.ticket(scopeOf(req), req.params.id),
      Keys.projectResync(scopeOf(req)),
      Keys.sprintMembership(scopeOf(req))
    ])
  )
  const update = updateTicketDetail(ticketRequest(orgSlug, slug, id))
  return Atom.readable((get) => {
    const revision = get(changed)
    return get(update).waiting ? null : revision
  }).pipe(Atom.debounce(350))
})

export const ticketActivityFirstPage = (req: TicketActivityRequest) =>
  pageQuery(req, null)

export const ticketActivity = Atom.family((req: TicketActivityRequest) =>
  Atom.readable(
    (get) => {
      const firstPage = pageQuery(req, null)
      const pages = [firstPage]
      get.once(refreshActivity(req))
      get.subscribe(refreshActivity(req), (revision) => {
        if (revision !== null)
          queueMicrotask(() => {
            for (const page of pages) get.registry.refresh(page)
          })
      })
      const first = get(firstPage)
      if (!AsyncResult.isSuccess(first)) {
        return AsyncResult.map(first, () => ({ items: [], hasOlder: false }))
      }
      const items = [...first.value.items]
      let nextCursor = first.value.nextCursor
      let waiting = first.waiting
      while (nextCursor !== null) {
        const source = pageQuery(req, nextCursor)
        pages.push(source)
        const page = get(source)
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
  ).pipe(Atom.setIdleTTL("30 minutes"))
)
