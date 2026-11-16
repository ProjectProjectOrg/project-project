import * as DateTime from "effect/DateTime"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"

import { Keys } from "@/api/keys"
import { query } from "@/api/query"

import { localInboxList, localInboxUnread } from "./localInbox"

export type InboxRequest = Readonly<{
  _view: "inbox"
  params: Readonly<{ orgSlug: string }>
  readSince: string
}>

export const inboxRequest = (
  orgSlug: string,
  readSince: string
): InboxRequest => ({ _view: "inbox", params: { orgSlug }, readSince })

const preferLocal = <A, B extends A, E, F>(
  local: AsyncResult.AsyncResult<B | null, F>,
  server: () => AsyncResult.AsyncResult<A, E>
): AsyncResult.AsyncResult<A, E> => {
  if (AsyncResult.isInitial(local)) return AsyncResult.initial(true)
  if (AsyncResult.isSuccess(local) && local.value !== null)
    return AsyncResult.success(local.value)
  return server()
}

const inboxQuery = (req: InboxRequest) =>
  query("inbox", "list", {
    params: req.params,
    query: { readSince: DateTime.toDate(DateTime.makeUnsafe(req.readSince)) },
    timeToLive: "30 seconds",
    reactivityKeys: [Keys.inbox(req.params.orgSlug)]
  })

export const inboxList = Atom.family((req: InboxRequest) =>
  Atom.make((get) =>
    preferLocal(
      get(
        localInboxList({
          orgSlug: req.params.orgSlug,
          readSince: req.readSince
        })
      ),
      () => get(inboxQuery(req))
    )
  )
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
  Atom.make((get) =>
    preferLocal(
      AsyncResult.map(get(localInboxUnread(req.params.orgSlug)), (count) =>
        count === null ? null : { count }
      ),
      () => get(inboxUnreadQuery(req))
    )
  )
)
