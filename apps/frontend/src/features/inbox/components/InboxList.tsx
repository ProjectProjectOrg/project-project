import type { InboxItem } from "@pp/shared"
import { CheckCheck, Inbox, MailCheck } from "lucide-react"
import type { RefObject } from "react"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@/components/ui/empty"
import { InboxRow } from "@/features/inbox/components/InboxRow"
import type { InboxActions } from "@/features/inbox/hooks/useInboxActions"
import { inboxKey } from "@/features/inbox/lib/inboxRows"
import { m } from "@/paraglide/messages"

export function InboxList({
  orgSlug,
  items,
  selected,
  actions,
  listRef
}: Readonly<{
  orgSlug: string
  items: ReadonlyArray<InboxItem>
  selected: InboxItem | null
  actions: InboxActions
  listRef: RefObject<HTMLUListElement | null>
}>) {
  const tabbable = selected ?? items[0] ?? null
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-1 px-4 pt-4 pb-2">
        <h1 className="flex-1 text-title font-semibold">{m.inbox_title()}</h1>
        <Button
          variant="ghost"
          size="sm"
          disabled={!items.some((item) => item.unread)}
          onClick={actions.readAll}
          className="transition-transform duration-100 active:scale-[0.97]"
        >
          <MailCheck />
          <span className="max-lg:sr-only">{m.inbox_mark_all_read()}</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={items.length === 0}
          onClick={actions.doneAll}
          className="transition-transform duration-100 active:scale-[0.97]"
        >
          <CheckCheck />
          <span className="max-lg:sr-only">{m.inbox_mark_all_done()}</span>
        </Button>
      </header>
      {items.length === 0 ? (
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Inbox strokeWidth={1.75} />
            </EmptyMedia>
            <EmptyTitle>{m.inbox_empty_title()}</EmptyTitle>
            <EmptyDescription>{m.inbox_empty_body()}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul
          ref={listRef}
          aria-label={m.inbox_list_label()}
          className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain px-2 pb-4"
        >
          {items.map((item) => (
            <InboxRow
              key={inboxKey(item)}
              orgSlug={orgSlug}
              item={item}
              rowKey={inboxKey(item)}
              selected={item === selected}
              tabbable={item === tabbable}
              onDone={actions.done}
              onUnsubscribe={actions.unsubscribe}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
