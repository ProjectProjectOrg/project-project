import type {
  InboxEntry,
  InboxEntryId,
  InboxEntryStatus,
  InboxRevisionPayload,
  TicketId
} from "@pp/shared"
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import * as Reactivity from "effect/reactivity/Reactivity"

import { Api } from "@/api/Api"
import { Keys } from "@/api/keys"
import { query } from "@/api/query"
import { viewMutation } from "@/api/viewMutation"
import {
  deleteEntry,
  markAllEntriesRead,
  markEntryRead,
  markEntryUnread,
  withStatus
} from "@/features/inbox/lib/entries"

export const INBOX_PAGE = 200

export const inboxRequest = (orgSlug: string, pages = 1) =>
  ({ _view: "inbox", params: { orgSlug }, pages }) as const

export type InboxRequest = ReturnType<typeof inboxRequest>

const inboxQuery = (req: InboxRequest) =>
  query("inbox", "list", {
    params: req.params,
    query: req.pages === 1 ? {} : { limit: req.pages * INBOX_PAGE },
    reactivityKeys: [Keys.inbox(req.params.orgSlug)]
  })

export const inboxEntries = Atom.family((req: InboxRequest) =>
  Atom.optimistic(inboxQuery(req))
)

export const inboxCountRequest = (orgSlug: string) =>
  ({ _view: "inboxCount", params: { orgSlug } }) as const

export type InboxCountRequest = ReturnType<typeof inboxCountRequest>

const inboxCountQuery = (req: InboxCountRequest) =>
  query("inbox", "count", {
    params: req.params,
    reactivityKeys: [Keys.inboxCount(req.params.orgSlug)]
  })

export const inboxCount = Atom.family((req: InboxCountRequest) =>
  Atom.optimistic(inboxCountQuery(req))
)

export const unreadInboxCount = Atom.family((req: InboxCountRequest) =>
  Atom.readable((get) =>
    AsyncResult.map(get(inboxCount(req)), (count) => count.unread)
  )
)

type EntryKey = Readonly<{ req: InboxRequest; id: InboxEntryId }>

const entryParams = ({ req, id }: EntryKey) => ({ ...req.params, id })

const countChanged = (req: InboxRequest) => [
  Keys.inboxCount(req.params.orgSlug)
]

const changedSince = (
  req: InboxRequest,
  status: InboxEntryStatus,
  shown: InboxRevisionPayload
) =>
  status.revision > shown.revision
    ? Keys.inboxChanged(req.params.orgSlug)
    : countChanged(req)

export const readInboxEntry = Atom.family((key: EntryKey) =>
  viewMutation(inboxEntries(key.req), {
    name: "readInboxEntry",
    predict: (entries, _input: InboxRevisionPayload) =>
      markEntryRead(entries, key.id),
    call: (client, payload) =>
      client.inbox.markRead({ params: entryParams(key), payload }),
    confirm: withStatus,
    publish: (status, shown) => changedSince(key.req, status, shown)
  })
)

export const unreadInboxEntry = Atom.family((key: EntryKey) =>
  viewMutation(inboxEntries(key.req), {
    name: "unreadInboxEntry",
    predict: (entries, input: Readonly<{ prediction: InboxEntry }>) =>
      markEntryUnread(entries, input.prediction),
    call: (client) => client.inbox.markUnread({ params: entryParams(key) }),
    confirm: withStatus,
    publish: () => countChanged(key.req)
  })
)

export const deleteInboxEntry = Atom.family((key: EntryKey) =>
  viewMutation(inboxEntries(key.req), {
    name: "deleteInboxEntry",
    predict: (
      entries,
      input: Readonly<{
        payload: InboxRevisionPayload
        prediction: InboxEntry
      }>
    ) => deleteEntry(entries, input.prediction),
    call: (client, input) =>
      client.inbox.remove({ params: entryParams(key), query: input.payload }),
    confirm: withStatus,
    publish: (status, input) => changedSince(key.req, status, input.payload)
  })
)

export const readAllInboxEntries = Atom.family((req: InboxRequest) =>
  viewMutation(inboxEntries(req), {
    name: "readAllInboxEntries",
    predict: (entries, payload: Readonly<{ upTo: Date }>) =>
      markAllEntriesRead(entries, payload.upTo),
    call: (client, payload) =>
      client.inbox.markAllRead({ params: req.params, payload }),
    confirm: (entries, _cleared, payload) =>
      markAllEntriesRead(entries, payload.upTo),
    publish: () => countChanged(req)
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
      yield* Api.use((client) => client.inbox.markTicketRead({ params: req }))
      yield* Reactivity.invalidate(Keys.inboxChanged(req.orgSlug))
    })
  )
)
