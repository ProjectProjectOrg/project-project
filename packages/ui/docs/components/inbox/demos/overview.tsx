import { DropdownMenuShortcut } from "@pp/ui/dropdown-menu"
import {
  BellOff,
  ChevronRight,
  Copy,
  InboxRemove,
  InboxUnread,
  Pin
} from "@pp/ui/icons"
import { Inbox } from "@pp/ui/inbox"
import { cn } from "@pp/ui/lib/utils"
import {
  menuItemClass,
  menuSeparatorClass,
  menuSurfaceClass
} from "@pp/ui/menu-styles"
import type { ReactNode } from "react"

import {
  ASSIGNED,
  DESCRIPTION,
  KEY_LABELS,
  MENTION,
  REPLIED,
  UPDATES,
  Row
} from "./parts/entries"

function Cell({
  caption,
  children
}: Readonly<{ caption: string; children: ReactNode }>) {
  return (
    <div className="grid min-w-0 content-start gap-1">
      <p className="px-[22px] text-caption text-muted-foreground">{caption}</p>
      {children}
    </div>
  )
}

function DrawnMenu() {
  return (
    <div className={cn(menuSurfaceClass, "relative ml-[22px] w-max")}>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-[5px] top-[5px] block h-[34px] translate-y-px rounded-md bg-menu-hover"
      />
      <div data-highlighted="" className={cn(menuItemClass, "relative")}>
        <InboxUnread strokeWidth={1.75} />
        Mark as read
        <DropdownMenuShortcut keys="u" keyLabels={KEY_LABELS} />
      </div>
      <div className={menuItemClass}>
        <InboxRemove strokeWidth={1.75} />
        Delete notification
        <DropdownMenuShortcut keys="backspace" keyLabels={KEY_LABELS} />
      </div>
      <div className={menuItemClass}>
        <BellOff strokeWidth={1.75} />
        Unsubscribe
        <DropdownMenuShortcut keys="shift+u" keyLabels={KEY_LABELS} />
      </div>
      <div className={menuSeparatorClass} />
      <div className={menuItemClass}>
        <Pin strokeWidth={1.75} />
        Pin
      </div>
      <div className={menuItemClass}>
        <Copy strokeWidth={1.75} />
        Copy
        <ChevronRight className="ml-auto size-4" />
      </div>
    </div>
  )
}

export default function Overview() {
  return (
    <div className="@container grid w-full gap-6 rounded-xl surface-page p-3">
      <Inbox.List>
        <Inbox.Group label="Today: right-click a row for its menu">
          <Row entry={MENTION} />
          <Row entry={ASSIGNED} />
          <Row entry={DESCRIPTION} />
          <Row entry={UPDATES} />
        </Inbox.Group>
      </Inbox.List>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-3 gap-y-4 @2xl:grid-cols-[repeat(2,minmax(0,1fr))]">
        <Cell caption="Unread mention">
          <Row entry={MENTION} />
        </Cell>
        <Cell caption="Read mention">
          <Row entry={{ ...MENTION, unread: false }} />
        </Cell>
        <Cell caption="Hover: only the fill, nothing moves">
          <Row entry={MENTION} force="hover" />
        </Cell>
        <Cell caption="Selected">
          <Row entry={ASSIGNED} selected />
        </Cell>
        <Cell caption="Focus">
          <Row entry={DESCRIPTION} force="focus" />
        </Cell>
        <Cell caption="Replied: cleared, but stays in place">
          <Row entry={REPLIED} selected />
        </Cell>
        <Cell caption="Updates, read until the next visit">
          <Row entry={UPDATES} />
        </Cell>
        <Cell caption="Right-click: the row's menu, with its keys">
          <DrawnMenu />
        </Cell>
      </div>
    </div>
  )
}
