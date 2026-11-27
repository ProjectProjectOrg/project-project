import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { InboxEntry, InboxEntryId } from "@pp/shared"
import { Button } from "@pp/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@pp/ui/empty"
import { ArrowLeft, Inbox as InboxIcon, InboxUnread } from "@pp/ui/icons"
import { Inbox } from "@pp/ui/inbox"
import { SplitPane } from "@pp/ui/split-pane"
import { ShortcutTooltip } from "@pp/ui/tooltip"
import { HotkeysProvider, useHotkey } from "@tanstack/react-hotkeys"
import { getRouteApi, Link } from "@tanstack/react-router"
import * as DateTime from "effect/DateTime"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { useMemo, useState, useSyncExternalStore } from "react"

import { AsyncView } from "@/components/shell/AsyncView"
import {
  actedInboxEntry,
  deleteInboxEntry,
  INBOX_PAGE,
  inboxCountRequest,
  inboxEntries,
  inboxRequest,
  readAllInboxEntries,
  readInboxEntry,
  unreadInboxCount,
  unreadInboxEntry,
  type InboxRequest
} from "@/features/inbox/atoms/inbox"
import { InboxEntryRow } from "@/features/inbox/components/InboxEntryRow"
import { InboxTicketPane } from "@/features/inbox/components/InboxTicketPane"
import { useInboxPolling } from "@/features/inbox/hooks/useInboxPolling"
import { unreadCount } from "@/features/inbox/lib/entries"
import {
  groupByDay,
  rememberEntries,
  shownEntries,
  stepEntry,
  type SeenEntries,
  type ShownEntry
} from "@/features/inbox/lib/visit"
import { appHotkeys } from "@/lib/appHotkeys"
import { keyLabels } from "@/lib/keyLabels"
import { mutationErrorText } from "@/lib/mutationError"
import { m } from "@/paraglide/messages"

const routeApi = getRouteApi("/_authed/orgs/$orgSlug/inbox")

const WIDE = "(min-width: 1024px)"

const subscribeWide = (notify: () => void) => {
  const query = window.matchMedia(WIDE)
  query.addEventListener("change", notify)
  return () => query.removeEventListener("change", notify)
}

const useWide = () =>
  useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches)

const nowDate = () => DateTime.toDate(DateTime.nowUnsafe())

function CaughtUp() {
  return (
    <Empty variant="plain" className="min-h-0 flex-1">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <InboxIcon strokeWidth={1.75} />
        </EmptyMedia>
        <EmptyTitle>{m.inbox_caught_up_title()}</EmptyTitle>
        <EmptyDescription>{m.inbox_caught_up_body()}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function NothingOpen() {
  return (
    <Empty variant="plain" className="h-full min-h-0">
      <EmptyHeader>
        <EmptyTitle>{m.inbox_nothing_open_title()}</EmptyTitle>
        <EmptyDescription>{m.inbox_nothing_open_body()}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function useInboxFailure(req: InboxRequest) {
  const acted = useAtomValue(actedInboxEntry(req))
  const key = { req, id: acted ?? ("" as InboxEntryId) }
  const failures = [
    useAtomValue(readAllInboxEntries(req)),
    useAtomValue(readInboxEntry(key)),
    useAtomValue(unreadInboxEntry(key)),
    useAtomValue(deleteInboxEntry(key))
  ].map((result) => mutationErrorText(result))
  return failures.find((failure) => failure !== null) ?? null
}

function Header({
  req,
  loaded
}: Readonly<{ req: InboxRequest; loaded: number }>) {
  const count = useAtomValue(
    unreadInboxCount(inboxCountRequest(req.params.orgSlug))
  )
  const unread = AsyncResult.isSuccess(count) ? count.value : loaded
  const readAll = useAtomSet(readAllInboxEntries(req))
  const failure = useInboxFailure(req)
  return (
    <Inbox.Header>
      <Inbox.Heading
        count={unread}
        countLabel={m.inbox_unread_count({ count: unread })}
      >
        {m.inbox_title()}
      </Inbox.Heading>
      {failure === null ? null : (
        <p className="min-w-0 truncate text-caption text-destructive">
          {failure}
        </p>
      )}
      <Inbox.HeaderActions>
        {unread === 0 ? null : (
          <ShortcutTooltip
            hotkey={appHotkeys["inbox.mark-all-read"]}
            keyLabels={keyLabels()}
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={() => readAll({ upTo: nowDate() })}
            >
              <InboxUnread strokeWidth={1.75} className="size-4" />
              {m.inbox_mark_all_read()}
            </Button>
          </ShortcutTooltip>
        )}
      </Inbox.HeaderActions>
    </Inbox.Header>
  )
}

function EntryList({
  req,
  shown,
  selected,
  older
}: Readonly<{
  req: InboxRequest
  shown: ReadonlyArray<ShownEntry>
  selected: InboxEntryId | null
  older: Older | null
}>) {
  const groups = groupByDay(shown, nowDate())
  const group = (label: string, items: ReadonlyArray<ShownEntry>) =>
    items.length === 0 ? null : (
      <Inbox.Group label={label}>
        {items.map(({ entry, resolved }) => (
          <InboxEntryRow
            key={entry.id}
            req={req}
            entry={entry}
            resolved={resolved}
            selected={entry.id === selected}
          />
        ))}
      </Inbox.Group>
    )
  return (
    <div className="pb-2">
      <Inbox.List>
        {group(m.inbox_group_today(), groups.today)}
        {group(m.inbox_group_earlier(), groups.earlier)}
      </Inbox.List>
      {older === null ? null : (
        <div className="px-4 pt-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={older.loading}
            onClick={older.show}
          >
            {older.loading ? m.inbox_showing_older() : m.inbox_show_older()}
          </Button>
        </div>
      )}
    </div>
  )
}

function useEntryKeys(
  req: InboxRequest,
  shown: ReadonlyArray<ShownEntry>,
  selected: InboxEntry | null,
  select: (entry: InboxEntry | null) => void
) {
  const key = { req, id: selected?.id ?? ("" as InboxEntryId) }
  const read = useAtomSet(readInboxEntry(key))
  const unread = useAtomSet(unreadInboxEntry(key))
  const remove = useAtomSet(deleteInboxEntry(key))
  const readAll = useAtomSet(readAllInboxEntries(req))
  const act = useAtomSet(actedInboxEntry(req))
  const id = selected?.id ?? null
  useHotkey(appHotkeys["inbox.next"], () => select(stepEntry(shown, id, 1)))
  useHotkey(appHotkeys["inbox.previous"], () =>
    select(stepEntry(shown, id, -1))
  )
  useHotkey(appHotkeys["inbox.toggle-read"], () => {
    if (selected === null) return
    act(selected.id)
    if (selected.state === "unread") read({ revision: selected.revision })
    else unread({ prediction: selected })
  })
  useHotkey(appHotkeys["inbox.delete"], () => {
    if (selected === null) return
    const next = stepEntry(shown, selected.id, 1)
    act(selected.id)
    remove({
      payload: { revision: selected.revision },
      prediction: selected
    })
    select(next?.id === selected.id ? stepEntry(shown, selected.id, -1) : next)
  })
  useHotkey(appHotkeys["inbox.mark-all-read"], () =>
    readAll({ upTo: nowDate() })
  )
}

type Older = Readonly<{ loading: boolean; show: () => void }>

function InboxView({
  req,
  latest,
  selectedId,
  older
}: Readonly<{
  req: InboxRequest
  latest: ReadonlyArray<InboxEntry>
  selectedId: InboxEntryId | null
  older: Older | null
}>) {
  const navigate = routeApi.useNavigate()
  const wide = useWide()
  const [seen, setSeen] = useState<SeenEntries>(() =>
    rememberEntries(new Map(), latest)
  )
  const [rememberedFrom, setRememberedFrom] = useState(latest)
  if (rememberedFrom !== latest) {
    setRememberedFrom(latest)
    setSeen(rememberEntries(seen, latest))
  }
  const shown = useMemo(
    () => shownEntries(seen, latest, selectedId),
    [seen, latest, selectedId]
  )
  const selected =
    shown.find((item) => item.entry.id === selectedId)?.entry ?? null
  const select = (entry: InboxEntry | null) =>
    void navigate({
      search: entry === null ? {} : { entry: entry.id },
      replace: true
    })
  useEntryKeys(req, shown, selected, select)

  const header = <Header req={req} loaded={unreadCount(latest)} />
  if (shown.length === 0)
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <CaughtUp />
      </div>
    )
  const list = (
    <div className="flex h-full min-h-0 flex-col">
      {header}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <EntryList
          req={req}
          shown={shown}
          selected={selectedId}
          older={older}
        />
      </div>
    </div>
  )
  const ticket =
    selected === null ? null : (
      <InboxTicketPane key={selected.id} req={req} entry={selected} />
    )
  if (!wide)
    return ticket === null ? (
      list
    ) : (
      <div className="flex flex-col gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          render={
            <Link to="/orgs/$orgSlug/inbox" params={req.params} search={{}} />
          }
        >
          <ArrowLeft strokeWidth={1.75} className="size-4" />
          {m.inbox_back()}
        </Button>
        {ticket}
      </div>
    )
  return (
    <SplitPane.Root id="inbox">
      <SplitPane.Panel id="list" defaultSize="38%" minSize={320} maxSize="60%">
        {list}
      </SplitPane.Panel>
      <SplitPane.Divider aria-label={m.inbox_resize_list()} />
      <SplitPane.Panel id="ticket" minSize={420}>
        <div className="h-full overflow-y-auto px-6 pt-3 pb-6">
          {ticket ?? <NothingOpen />}
        </div>
      </SplitPane.Panel>
    </SplitPane.Root>
  )
}

const MAX_PAGES = 5

export function InboxPage() {
  const { orgSlug } = routeApi.useParams()
  const { entry } = routeApi.useSearch()
  const [pages, setPages] = useState(1)
  const req = inboxRequest(orgSlug, pages)
  const earlierReq = inboxRequest(orgSlug, Math.max(1, pages - 1))
  useInboxPolling(orgSlug, pages)
  const result = useAtomValue(inboxEntries(req))
  const earlier = useAtomValue(inboxEntries(earlierReq))
  const refresh = useAtomRefresh(inboxEntries(req))
  const growing =
    AsyncResult.isInitial(result) && AsyncResult.isSuccess(earlier)
  const viewReq = growing ? earlierReq : req
  return (
    <HotkeysProvider scope="inbox">
      <div className="-mx-6 -mb-6 flex min-h-0 flex-1 flex-col lg:h-[calc(100dvh-5.5rem)] lg:flex-none">
        <AsyncView
          result={growing ? earlier : result}
          reset={refresh}
          contained
          onInitial={() => null}
          onSuccess={({ value }) => (
            <InboxView
              key={orgSlug}
              req={viewReq}
              latest={value}
              selectedId={(entry ?? null) as InboxEntryId | null}
              older={
                value.length < viewReq.pages * INBOX_PAGE ||
                viewReq.pages >= MAX_PAGES
                  ? null
                  : { loading: growing, show: () => setPages(pages + 1) }
              }
            />
          )}
        />
      </div>
    </HotkeysProvider>
  )
}
