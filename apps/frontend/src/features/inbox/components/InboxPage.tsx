import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { InboxItem } from "@pp/shared"
import { getRouteApi } from "@tanstack/react-router"
import * as DateTime from "effect/DateTime"
import { useMemo, useRef, useState } from "react"

import { AsyncView } from "@/components/shell/AsyncView"
import { ResizableSplit } from "@/components/ui/resizable-split"
import {
  inboxList,
  inboxRequest,
  type InboxRequest
} from "@/features/inbox/atoms/inbox"
import { InboxList } from "@/features/inbox/components/InboxList"
import { InboxTicketPane } from "@/features/inbox/components/InboxTicketPane"
import { useInboxActions } from "@/features/inbox/hooks/useInboxActions"
import { useInboxCommands } from "@/features/inbox/hooks/useInboxCommands"
import { useInboxKeys } from "@/features/inbox/hooks/useInboxKeys"
import { inboxKey, stepRow } from "@/features/inbox/lib/inboxRows"
import {
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import { useVisibleInterval } from "@/hooks/useVisibleInterval"
import { m } from "@/paraglide/messages"

const routeApi = getRouteApi("/_authed/orgs/$orgSlug/inbox")

const POLL_MS = 30_000

export function InboxPage() {
  const { orgSlug } = routeApi.useParams()
  const [readSince] = useState(() => DateTime.formatIso(DateTime.nowUnsafe()))
  const req = inboxRequest(orgSlug, readSince)
  const result = useAtomValue(inboxList(req))
  const refresh = useAtomRefresh(inboxList(req))
  useVisibleInterval(refresh, POLL_MS, true)
  return (
    <div className="absolute inset-0 flex min-h-0">
      <AsyncView
        result={result}
        reset={refresh}
        contained
        onInitial={() => null}
        onSuccess={({ value }) => <InboxView req={req} items={value} />}
      />
    </div>
  )
}

type Opened = Readonly<{ key: string | null; readSince: Date | null }>

function InboxView({
  req,
  items
}: Readonly<{ req: InboxRequest; items: ReadonlyArray<InboxItem> }>) {
  const { orgSlug } = req.params
  const { ticket: selectedKey } = routeApi.useSearch()
  const listRef = useRef<HTMLUListElement>(null)
  const selected = useMemo(
    () => items.find((item) => inboxKey(item) === selectedKey) ?? null,
    [items, selectedKey]
  )
  const [opened, setOpened] = useState<Opened>({ key: null, readSince: null })
  if (selected !== null && opened.key !== selectedKey) {
    setOpened({ key: inboxKey(selected), readSince: selected.lastReadAt })
  }

  const actions = useInboxActions(req, items, selected)
  const commands = useInboxCommands(selected, actions)
  useInboxKeys(items, selected, actions, listRef)

  const neighbours =
    selected === null
      ? []
      : [1 as const, -1 as const].flatMap((step) => {
          const item = stepRow(items, inboxKey(selected), step)
          return item === null || item === selected ? [] : [item]
        })

  return (
    <ResizableSplit
      storageKey="pp.inbox.listWidth"
      label={m.inbox_resize()}
      defaultSize={380}
      min={280}
      max={640}
      show={selected === null ? "start" : "end"}
      start={
        <InboxList
          orgSlug={orgSlug}
          items={items}
          selected={selected}
          actions={actions}
          listRef={listRef}
        />
      }
      end={
        selected === null ? (
          <p className="m-auto text-body text-muted-foreground">
            {m.inbox_pane_empty()}
          </p>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-4 pb-6">
            {neighbours.map((item) => (
              <PrefetchTicket
                key={inboxKey(item)}
                orgSlug={orgSlug}
                item={item}
              />
            ))}
            <InboxTicketPane
              key={inboxKey(selected)}
              orgSlug={orgSlug}
              projectSlug={selected.projectSlug}
              id={selected.ticket.id}
              readSince={opened.readSince}
              commands={commands}
              onClose={() => actions.select(null, false)}
            />
          </div>
        )
      }
    />
  )
}

function PrefetchTicket({
  orgSlug,
  item
}: Readonly<{ orgSlug: string; item: InboxItem }>) {
  useAtomValue(
    ticketDetail(ticketRequest(orgSlug, item.projectSlug, item.ticket.id))
  )
  return null
}
