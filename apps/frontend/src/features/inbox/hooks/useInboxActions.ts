import { RegistryContext, useAtomSet } from "@effect/atom-react"
import type { InboxItem } from "@pp/shared"
import { useNavigate } from "@tanstack/react-router"
import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef
} from "react"

import { fireMutation } from "@/api/viewMutation"
import {
  markInboxAllDone,
  markInboxAllRead,
  markInboxDone,
  markInboxRead,
  markInboxUnread,
  restoreInboxRow,
  type InboxRequest
} from "@/features/inbox/atoms/inbox"
import { afterRemoving, inboxKey } from "@/features/inbox/lib/inboxRows"
import {
  setSubscribed,
  ticketSubscribersRequest
} from "@/features/subscriptions/atoms/ticketSubscribers"

const rowOf = (req: InboxRequest, item: InboxItem) => ({
  req,
  projectSlug: item.projectSlug,
  id: item.ticket.id
})

export type InboxActions = ReturnType<typeof useInboxActions>

export type ClearedRow = Readonly<{
  item: InboxItem
  unsubscribed: boolean
  wasSelected: boolean
  settled: Promise<unknown>
}>

export function useInboxActions(
  req: InboxRequest,
  items: ReadonlyArray<InboxItem>,
  selected: InboxItem | null,
  cleared: ClearedRow | null,
  setCleared: (cleared: ClearedRow | null) => void
) {
  const { orgSlug } = req.params
  const navigate = useNavigate()
  const registry = useContext(RegistryContext)
  const readAllSet = useAtomSet(markInboxAllRead(req))
  const doneAllSet = useAtomSet(markInboxAllDone(req))
  const latest = useRef({ items, selected, cleared })
  useLayoutEffect(() => {
    latest.current = { items, selected, cleared }
  })

  useEffect(() => {
    if (selected?.unread === true)
      void fireMutation(
        registry,
        markInboxRead(rowOf(req, selected)),
        undefined
      )
  }, [selected, req, registry])

  const select = useCallback(
    (item: InboxItem | null, replace: boolean) =>
      void navigate({
        to: "/orgs/$orgSlug/inbox",
        params: { orgSlug },
        search: item === null ? {} : { ticket: inboxKey(item) },
        replace
      }),
    [navigate, orgSlug]
  )

  const subscribe = useCallback(
    (item: InboxItem, subscribed: boolean) =>
      fireMutation(
        registry,
        setSubscribed(
          ticketSubscribersRequest(orgSlug, item.projectSlug, item.ticket.id)
        ),
        subscribed
      ),
    [registry, orgSlug]
  )

  const clear = useCallback(
    (item: InboxItem, unsubscribed: boolean) => {
      const { items: current, selected: open } = latest.current
      const wasSelected = open !== null && inboxKey(open) === inboxKey(item)
      if (wasSelected) select(afterRemoving(current, inboxKey(item)), true)
      const settled = Promise.all([
        unsubscribed ? subscribe(item, false) : null,
        fireMutation(registry, markInboxDone(rowOf(req, item)), undefined)
      ])
      setCleared({ item, unsubscribed, wasSelected, settled })
    },
    [select, subscribe, registry, req, setCleared]
  )

  const done = useCallback((item: InboxItem) => clear(item, false), [clear])

  const unsubscribe = useCallback(
    (item: InboxItem) => clear(item, true),
    [clear]
  )

  const undo = useCallback(() => {
    const last = latest.current.cleared
    if (last === null) return
    setCleared(null)
    void fireMutation(registry, restoreInboxRow(req), {
      item: last.item,
      after: last.settled
    })
    if (last.unsubscribed)
      void last.settled.then(() => subscribe(last.item, true))
    if (last.wasSelected) select(last.item, true)
  }, [registry, req, subscribe, select, setCleared])

  const toggleUnread = useCallback(
    (item: InboxItem) =>
      void fireMutation(
        registry,
        (item.unread ? markInboxRead : markInboxUnread)(rowOf(req, item)),
        undefined
      ),
    [registry, req]
  )

  const openTicket = useCallback(
    (item: InboxItem) =>
      void navigate({
        to: "/orgs/$orgSlug/projects/$slug/tickets/$id",
        params: { orgSlug, slug: item.projectSlug, id: item.ticket.id }
      }),
    [navigate, orgSlug]
  )

  const readAll = useCallback(() => readAllSet(undefined), [readAllSet])

  const doneAll = useCallback(() => {
    select(null, true)
    setCleared(null)
    doneAllSet(undefined)
  }, [select, setCleared, doneAllSet])

  return useMemo(
    () => ({
      select,
      done,
      toggleUnread,
      unsubscribe,
      undo,
      openTicket,
      readAll,
      doneAll
    }),
    [
      select,
      done,
      toggleUnread,
      unsubscribe,
      undo,
      openTicket,
      readAll,
      doneAll
    ]
  )
}
