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

export function useInboxActions(
  req: InboxRequest,
  items: ReadonlyArray<InboxItem>,
  selected: InboxItem | null
) {
  const { orgSlug } = req.params
  const navigate = useNavigate()
  const registry = useContext(RegistryContext)
  const readAllSet = useAtomSet(markInboxAllRead(req))
  const doneAllSet = useAtomSet(markInboxAllDone(req))
  const latest = useRef({ items, selected })
  useLayoutEffect(() => {
    latest.current = { items, selected }
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

  const done = useCallback(
    (item: InboxItem) => {
      const { items: current, selected: open } = latest.current
      if (open !== null && inboxKey(open) === inboxKey(item))
        select(afterRemoving(current, inboxKey(item)), true)
      void fireMutation(registry, markInboxDone(rowOf(req, item)), undefined)
    },
    [select, registry, req]
  )

  const toggleUnread = useCallback(
    (item: InboxItem) =>
      void fireMutation(
        registry,
        (item.unread ? markInboxRead : markInboxUnread)(rowOf(req, item)),
        undefined
      ),
    [registry, req]
  )

  const unsubscribe = useCallback(
    (item: InboxItem) => {
      void fireMutation(
        registry,
        setSubscribed(
          ticketSubscribersRequest(orgSlug, item.projectSlug, item.ticket.id)
        ),
        false
      )
      done(item)
    },
    [registry, orgSlug, done]
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
    doneAllSet(undefined)
  }, [select, doneAllSet])

  return useMemo(
    () => ({
      select,
      done,
      toggleUnread,
      unsubscribe,
      openTicket,
      readAll,
      doneAll
    }),
    [select, done, toggleUnread, unsubscribe, openTicket, readAll, doneAll]
  )
}
