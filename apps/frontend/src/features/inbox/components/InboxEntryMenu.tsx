import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { InboxEntry } from "@pp/shared"
import {
  DropdownMenuConfirmItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut
} from "@pp/ui/dropdown-menu"
import { InboxRemove, InboxUnread, Pin, PinOff } from "@pp/ui/icons"
import { Inbox } from "@pp/ui/inbox"
import * as AsyncResult from "effect/reactivity/AsyncResult"

import {
  actedInboxEntry,
  deleteInboxEntry,
  readInboxEntry,
  unreadInboxEntry,
  type InboxRequest
} from "@/features/inbox/atoms/inbox"
import {
  pinItem,
  pinsFor,
  pinsRequest,
  unpinItem
} from "@/features/pins/atoms/pins"
import { projectRequest } from "@/features/projects/atoms/projects"
import { ProjectContext } from "@/features/projects/hooks/useProject"
import { SubscribeMenuItem } from "@/features/subscriptions/components/SubscribeMenuItem"
import {
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import { CopySubmenu } from "@/features/tickets/components/ticket-menu/CopySubmenu"
import { appHotkeys } from "@/lib/appHotkeys"
import { describeCause } from "@/lib/errorMessage"
import { keyLabels } from "@/lib/keyLabels"
import { m } from "@/paraglide/messages"

function PinItem({
  orgSlug,
  entry
}: Readonly<{ orgSlug: string; entry: InboxEntry }>) {
  const slug = entry.ticket.projectSlug
  const req = pinsRequest(orgSlug)
  const pins = useAtomValue(pinsFor(req))
  const detail = useAtomValue(
    ticketDetail(ticketRequest(orgSlug, slug, entry.ticket.id))
  )
  const pin = useAtomSet(pinItem({ req, slug }))
  const unpin = useAtomSet(
    unpinItem({ req, slug, kind: "ticket", ref: entry.ticket.id })
  )
  const pinned =
    AsyncResult.isSuccess(pins) &&
    pins.value.some(
      (item) =>
        item._tag === "ticket" &&
        item.projectSlug === slug &&
        item.ref === entry.ticket.id
    )
  if (pinned)
    return (
      <DropdownMenuItem onClick={() => unpin()}>
        <PinOff strokeWidth={1.75} />
        {m.chrome_sidebar_unpin()}
      </DropdownMenuItem>
    )
  return (
    <DropdownMenuItem
      disabled={!AsyncResult.isSuccess(detail)}
      onClick={() => {
        if (!AsyncResult.isSuccess(detail)) return
        const ticket = detail.value
        pin({
          payload: { _tag: "ticket", ref: ticket.id },
          prediction: {
            ticket: {
              id: ticket.id,
              title: ticket.title,
              status: ticket.status,
              archivedAt: ticket.archivedAt,
              parent: ticket.parent?.id ?? null
            }
          }
        })
      }}
    >
      <Pin strokeWidth={1.75} />
      {m.inbox_pin()}
    </DropdownMenuItem>
  )
}

export function InboxEntryMenu({
  req,
  entry
}: Readonly<{ req: InboxRequest; entry: InboxEntry }>) {
  const key = { req, id: entry.id }
  const read = useAtomSet(readInboxEntry(key))
  const unread = useAtomSet(unreadInboxEntry(key))
  const remove = useAtomSet(deleteInboxEntry(key), { mode: "promiseExit" })
  const act = useAtomSet(actedInboxEntry(req))
  const { orgSlug } = req.params
  const isUnread = entry.state === "unread"
  return (
    <Inbox.ContextMenu>
      <ProjectContext.Provider
        value={projectRequest(orgSlug, entry.ticket.projectSlug)}
      >
        <DropdownMenuItem
          onClick={() => {
            act(entry.id)
            if (isUnread) read({ revision: entry.revision })
            else unread({ prediction: entry })
          }}
        >
          <InboxUnread strokeWidth={1.75} />
          {isUnread ? m.inbox_mark_read() : m.inbox_mark_unread()}
          <DropdownMenuShortcut
            keys={appHotkeys["inbox.toggle-read"].defaultHotkey}
            keyLabels={keyLabels()}
          />
        </DropdownMenuItem>
        <DropdownMenuConfirmItem
          icon={<InboxRemove strokeWidth={1.75} />}
          label={m.inbox_delete()}
          confirmLabel={m.inbox_delete_confirm()}
          busyLabel={m.common_deleting_button()}
          describeError={describeCause}
          onConfirm={() =>
            remove({
              payload: { revision: entry.revision },
              prediction: entry
            })
          }
        />
        <SubscribeMenuItem ticketId={entry.ticket.id} />
        <DropdownMenuSeparator />
        <PinItem orgSlug={orgSlug} entry={entry} />
        <CopySubmenu ticket={entry.ticket} />
      </ProjectContext.Provider>
    </Inbox.ContextMenu>
  )
}
