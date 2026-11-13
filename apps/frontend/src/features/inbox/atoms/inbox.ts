import type { InboxItem, TicketId } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Atom from "effect/reactivity/Atom"
import * as Reactivity from "effect/reactivity/Reactivity"

import { Api } from "@/api/Api"
import { Keys } from "@/api/keys"
import { query } from "@/api/query"
import { keepPredicted, viewMutation } from "@/api/viewMutation"
import {
  readAllRows,
  readRow,
  unreadRow,
  withoutRow
} from "@/features/inbox/lib/inboxRows"

export type InboxRequest = Readonly<{
  _view: "inbox"
  params: Readonly<{ orgSlug: string }>
  readSince: string
}>

export const inboxRequest = (
  orgSlug: string,
  readSince: string
): InboxRequest => ({ _view: "inbox", params: { orgSlug }, readSince })

const inboxQuery = (req: InboxRequest) =>
  query("inbox", "list", {
    params: req.params,
    query: { readSince: DateTime.toDate(DateTime.makeUnsafe(req.readSince)) },
    timeToLive: "30 seconds",
    reactivityKeys: [Keys.inbox(req.params.orgSlug)]
  })

export const inboxList = Atom.family((req: InboxRequest) =>
  Atom.optimistic(inboxQuery(req))
)

export type InboxUnreadRequest = Readonly<{
  _view: "inboxUnread"
  params: Readonly<{ orgSlug: string }>
}>

export const inboxUnreadRequest = (orgSlug: string): InboxUnreadRequest => ({
  _view: "inboxUnread",
  params: { orgSlug }
})

const inboxUnreadQuery = (req: InboxUnreadRequest) =>
  query("inbox", "unread", {
    params: req.params,
    timeToLive: "5 minutes",
    reactivityKeys: [Keys.inbox(req.params.orgSlug)]
  })

export const inboxUnread = Atom.family((req: InboxUnreadRequest) =>
  Atom.optimistic(inboxUnreadQuery(req))
)

export type InboxRowRequest = Readonly<{
  req: InboxRequest
  projectSlug: string
  id: TicketId
}>

const now = () => DateTime.toDate(DateTime.nowUnsafe())

const rowKey = (row: InboxRowRequest): string => `${row.projectSlug}/${row.id}`

const ticketParams = (row: InboxRowRequest) => ({
  orgSlug: row.req.params.orgSlug,
  slug: row.projectSlug,
  id: row.id
})

const inboxChanged = (req: InboxRequest) => () => [
  Keys.inbox(req.params.orgSlug)
]

export const markInboxRead = Atom.family((row: InboxRowRequest) =>
  viewMutation(inboxList(row.req), {
    name: "markInboxRead",
    predict: (items: ReadonlyArray<InboxItem>, _input: void) =>
      readRow(items, rowKey(row), now()),
    call: (client) => client.inbox.markRead({ params: ticketParams(row) }),
    confirm: keepPredicted,
    publish: inboxChanged(row.req)
  })
)

export const markInboxUnread = Atom.family((row: InboxRowRequest) =>
  viewMutation(inboxList(row.req), {
    name: "markInboxUnread",
    predict: (items: ReadonlyArray<InboxItem>, _input: void) =>
      unreadRow(items, rowKey(row)),
    call: (client) => client.inbox.markUnread({ params: ticketParams(row) }),
    confirm: keepPredicted,
    publish: inboxChanged(row.req)
  })
)

export const markInboxDone = Atom.family((row: InboxRowRequest) =>
  viewMutation(inboxList(row.req), {
    name: "markInboxDone",
    predict: (items: ReadonlyArray<InboxItem>, _input: void) =>
      withoutRow(items, rowKey(row)),
    call: (client) => client.inbox.markDone({ params: ticketParams(row) }),
    confirm: keepPredicted,
    publish: inboxChanged(row.req)
  })
)

export const markInboxAllRead = Atom.family((req: InboxRequest) =>
  viewMutation(inboxList(req), {
    name: "markInboxAllRead",
    predict: (items: ReadonlyArray<InboxItem>, _input: void) =>
      readAllRows(items, now()),
    call: (client) => client.inbox.readAll({ params: req.params }),
    confirm: keepPredicted,
    publish: inboxChanged(req)
  })
)

export const markInboxAllDone = Atom.family((req: InboxRequest) =>
  viewMutation(inboxList(req), {
    name: "markInboxAllDone",
    predict: (_items: ReadonlyArray<InboxItem>, _input: void) => [],
    call: (client) => client.inbox.doneAll({ params: req.params }),
    confirm: keepPredicted,
    publish: inboxChanged(req)
  })
)

export type TicketReadRequest = Readonly<{
  orgSlug: string
  slug: string
  id: TicketId
}>

export const markTicketRead = Atom.family((req: TicketReadRequest) =>
  Api.runtime.fn(
    Effect.fn("markTicketRead")(function* (_: void) {
      yield* Api.use((client) => client.inbox.markRead({ params: req }))
      yield* Reactivity.invalidate([Keys.inbox(req.orgSlug)])
    })
  )
)
