import githubDark from "@pp/ui/assets/logos/github_dark.svg"
import githubLight from "@pp/ui/assets/logos/github_light.svg"
import { Avatar as UiAvatar, AvatarFallback } from "@pp/ui/avatar"
import {
  DropdownMenuConfirmItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from "@pp/ui/dropdown-menu"
import {
  AtSign,
  BellOff,
  Bot,
  Copy,
  FileText,
  Hash,
  InboxRemove,
  InboxUnread,
  Link2,
  Pin,
  Type,
  UserPlus
} from "@pp/ui/icons"
import { Inbox } from "@pp/ui/inbox"
import { ItemLink } from "@pp/ui/item-link"
import type { KeyLabels } from "@pp/ui/kbd"
import { MemberAvatar } from "@pp/ui/member-avatar"
import { TicketKey } from "@pp/ui/ticket-key"
import type { ReactNode } from "react"

export type Entry = Readonly<{
  id: string
  kind: "mentioned" | "description" | "assigned" | "updates"
  unread: boolean
  actor: Readonly<{ id: string; name: string }> | null
  actorName: string
  said?: ReactNode
  count?: number
  ticket: Readonly<{ key: string; title: string }>
  time: string
  resolved?: boolean
}>

const MAYA = { id: "maya", name: "Maya Jansen" }
const SANNE = { id: "sanne", name: "Sanne de Vries" }
const WOUTER = { id: "wouter", name: "Wouter Bakker" }
const JESSE = { id: "jesse", name: "Jesse Smit" }

const ENTRIES_TICKET = {
  key: "PP-405",
  title:
    "Work through assignments, mentions and updates as separate inbox entries"
}

export const MENTION: Entry = {
  id: "1",
  kind: "mentioned",
  unread: true,
  actor: MAYA,
  actorName: "Maya",
  said: (
    <>
      <Inbox.Mention>@luuk</Inbox.Mention> can the reply stay visible after the
      entry clears?
    </>
  ),
  ticket: ENTRIES_TICKET,
  time: "2m"
}

export const ASSIGNED: Entry = {
  id: "2",
  kind: "assigned",
  unread: true,
  actor: MAYA,
  actorName: "Maya",
  ticket: ENTRIES_TICKET,
  time: "5m"
}

export const REPLIED: Entry = {
  id: "3",
  kind: "mentioned",
  unread: false,
  actor: SANNE,
  actorName: "Sanne",
  said: "Should list_inbox page by entry or by ticket?",
  ticket: { key: "PP-352", title: "Inbox tools for agents and pp" },
  time: "40m",
  resolved: true
}

export const DESCRIPTION: Entry = {
  id: "4",
  kind: "description",
  unread: true,
  actor: WOUTER,
  actorName: "Wouter",
  ticket: {
    key: "PP-392",
    title: "The inbox and your own subscriptions sync into a private local copy"
  },
  time: "1h"
}

export const UPDATES: Entry = {
  id: "5",
  kind: "updates",
  unread: false,
  actor: null,
  actorName: "GitHub",
  said: "Moved to Code review",
  count: 3,
  ticket: {
    key: "PP-351",
    title: "Inbox page with the ticket alongside and an unread count"
  },
  time: "3h"
}

export const EARLIER: Entry = {
  id: "6",
  kind: "mentioned",
  unread: false,
  actor: JESSE,
  actorName: "Jesse",
  said: "Is the observed revision per entry or per ticket?",
  ticket: ENTRIES_TICKET,
  time: "Tue"
}

export const TODAY: ReadonlyArray<Entry> = [
  MENTION,
  ASSIGNED,
  REPLIED,
  DESCRIPTION,
  UPDATES
]

const reasonIcon = (entry: Entry) => {
  if (entry.kind === "assigned") return <UserPlus strokeWidth={2} />
  if (entry.kind === "updates") return undefined
  return <AtSign strokeWidth={2} />
}

const summary = (entry: Entry) => {
  if (entry.resolved) return "· you replied"
  if (entry.said !== undefined) return entry.said
  if (entry.kind === "assigned") return "assigned you"
  return "mentioned you in the description"
}

function Avatar({ entry }: Readonly<{ entry: Entry }>) {
  if (entry.actor === null)
    return (
      <UiAvatar aria-hidden className="size-7">
        <AvatarFallback>
          <img src={githubLight} alt="" className="size-4 dark:hidden" />
          <img src={githubDark} alt="" className="hidden size-4 dark:block" />
        </AvatarFallback>
      </UiAvatar>
    )
  return <MemberAvatar member={entry.actor} size={28} />
}

export const KEY_LABELS: KeyLabels = {
  ctrl: "Ctrl",
  meta: "Cmd",
  alt: "Alt",
  shift: "Shift",
  enter: "Enter",
  escape: "Esc",
  backspace: "Backspace",
  delete: "Delete",
  tab: "Tab",
  space: "Space"
}

function CopyItem({
  icon,
  label,
  keys
}: Readonly<{ icon: ReactNode; label: string; keys?: string }>) {
  return (
    <DropdownMenuItem>
      {icon}
      {label}
      {keys !== undefined && (
        <DropdownMenuShortcut keys={keys} keyLabels={KEY_LABELS} />
      )}
    </DropdownMenuItem>
  )
}

export function EntryMenu({
  entry,
  onToggleRead,
  onDelete
}: Readonly<{
  entry: Entry
  onToggleRead?: () => void
  onDelete?: () => void
}>) {
  return (
    <>
      <DropdownMenuItem onClick={onToggleRead}>
        <InboxUnread strokeWidth={1.75} />
        {entry.unread ? "Mark as read" : "Mark as unread"}
        <DropdownMenuShortcut keys="u" keyLabels={KEY_LABELS} />
      </DropdownMenuItem>
      <DropdownMenuConfirmItem
        icon={<InboxRemove strokeWidth={1.75} />}
        label="Delete notification"
        confirmLabel="Delete this notification?"
        busyLabel="Deleting…"
        describeError={() => "Couldn't delete the notification."}
        onConfirm={() => onDelete?.()}
      />
      <DropdownMenuItem>
        <BellOff strokeWidth={1.75} />
        Unsubscribe
        <DropdownMenuShortcut keys="shift+u" keyLabels={KEY_LABELS} />
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem>
        <Pin strokeWidth={1.75} />
        Pin
      </DropdownMenuItem>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Copy strokeWidth={1.75} />
          Copy
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <CopyItem
            icon={<Hash strokeWidth={1.75} />}
            label="Copy ID"
            keys="mod+."
          />
          <CopyItem
            icon={<Link2 strokeWidth={1.75} />}
            label="Copy URL"
            keys="mod+shift+,"
          />
          <CopyItem icon={<Type strokeWidth={1.75} />} label="Copy title" />
          <DropdownMenuSeparator />
          <CopyItem
            icon={<FileText strokeWidth={1.75} />}
            label="Copy as Markdown"
          />
          <CopyItem icon={<Bot strokeWidth={1.75} />} label="Copy as prompt" />
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </>
  )
}

export function Row({
  entry,
  selected = false,
  force,
  onToggleRead,
  onDelete
}: Readonly<{
  entry: Entry
  selected?: boolean
  force?: string
  onToggleRead?: () => void
  onDelete?: () => void
}>) {
  const direct = entry.kind !== "updates"
  return (
    <Inbox.Row
      data-force={force === "focus" ? undefined : force}
      unread={entry.unread}
      selected={selected}
    >
      <ItemLink
        data-force={force === "focus" ? "focus" : undefined}
        href={`#${entry.ticket.key}`}
        onClick={(event) => event.preventDefault()}
        aria-label={`${entry.unread ? "Unread, " : ""}${entry.actorName} on ${entry.ticket.key} ${entry.ticket.title}`}
      />
      <Inbox.Avatar reason={reasonIcon(entry)}>
        <Avatar entry={entry} />
      </Inbox.Avatar>
      <Inbox.Message>
        <Inbox.Text>
          <Inbox.Actor>{entry.actorName}</Inbox.Actor>
          <Inbox.Summary
            kind={
              entry.said !== undefined && direct && !entry.resolved
                ? "said"
                : "event"
            }
          >
            {summary(entry)}
          </Inbox.Summary>
        </Inbox.Text>
        {entry.count !== undefined && <Inbox.Count>+{entry.count}</Inbox.Count>}
        <Inbox.Time>{entry.time}</Inbox.Time>
      </Inbox.Message>
      <Inbox.Ticket>
        {entry.resolved && <Inbox.Resolved>Cleared</Inbox.Resolved>}
        <TicketKey value={entry.ticket.key} />
        <Inbox.Title>{entry.ticket.title}</Inbox.Title>
      </Inbox.Ticket>
      <Inbox.ContextMenu>
        <EntryMenu
          entry={entry}
          onToggleRead={onToggleRead}
          onDelete={onDelete}
        />
      </Inbox.ContextMenu>
    </Inbox.Row>
  )
}
