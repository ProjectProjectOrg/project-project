import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { useEffect, useMemo, useRef } from "react"
import { ChevronDown, ListChecks, X } from "lucide-react"
import { TicketGitChip } from "@/components/TicketGit"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@/components/ui/empty"
import { meAtom } from "@/atoms/auth"
import {
  assigneeFilterAtom,
  queryAtom,
  selectedTagsAtom,
  sortKeyAtom,
  statusFilterAtom,
  ticketListUiKey,
  typeFilterAtom
} from "@/atoms/ticketListUi"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import type { Member, Ticket, TicketId } from "@projectproject/shared"
import { AssigneeRowTrigger } from "./AssigneeField"
import { Expanded } from "./Expanded"
import { PriorityButton } from "./PriorityField"
import { SORTS } from "./sort"
import { StatusButton } from "./StatusField"
import { TypeButton } from "./TypeField"

const EMPTY_BORDER = "border border-dashed border-border"

export function FilteredList({
  orgSlug,
  slug,
  tickets,
  members,
  expandedId,
  onExpand,
  focusBody,
  onConsumeFocusBody
}: {
  orgSlug: string
  slug: string
  tickets: ReadonlyArray<Ticket>
  members: ReadonlyArray<Member>
  expandedId: TicketId | null
  onExpand: (id: TicketId | null) => void
  focusBody: boolean
  onConsumeFocusBody: () => void
}) {
  const key = ticketListUiKey(orgSlug, slug)
  const query = useAtomValue(queryAtom(key))
  const statusFilter = useAtomValue(statusFilterAtom(key))
  const typeFilter = useAtomValue(typeFilterAtom(key))
  const assigneeFilter = useAtomValue(assigneeFilterAtom(key))
  const selectedTags = useAtomValue(selectedTagsAtom(key))
  const sortKey = useAtomValue(sortKeyAtom(key))
  const me = useAtomValue(meAtom)
  const myId = Result.isSuccess(me) ? me.value.id : null

  const resolvedAssignee: "all" | "unassigned" | string =
    assigneeFilter === "mine" ? (myId ?? "unassigned") : assigneeFilter

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tickets
      .filter((t) => statusFilter === "all" || t.status === statusFilter)
      .filter((t) => typeFilter === "all" || t.type === typeFilter)
      .filter((t) =>
        resolvedAssignee === "all"
          ? true
          : resolvedAssignee === "unassigned"
            ? t.assignees.length === 0
            : t.assignees.includes(resolvedAssignee)
      )
      .filter((t) => selectedTags.every((sel) => t.tags.includes(sel)))
      .filter((t) => {
        if (!q) return true
        return (
          t.title.toLowerCase().includes(q) || t.id.toLowerCase().includes(q)
        )
      })
      .slice()
      .toSorted(SORTS[sortKey].compare)
  }, [
    tickets,
    query,
    statusFilter,
    typeFilter,
    resolvedAssignee,
    selectedTags,
    sortKey
  ])

  if (tickets.length === 0) return <NoTicketsYet />

  if (filtered.length === 0) {
    if (query.trim().length > 0) {
      return <NoSearchMatches orgSlug={orgSlug} slug={slug} query={query} />
    }
    return (
      <Empty className={cn(EMPTY_BORDER, "p-6")}>
        <EmptyDescription>{m.tickets_no_filter_matches()}</EmptyDescription>
      </Empty>
    )
  }

  return (
    <ul className="grid grid-cols-[auto_auto_auto_minmax(0,1fr)_auto_auto_auto_auto] divide-y divide-border rounded-xl border border-border bg-background">
      {filtered.map((t) => {
        const isExpanded = expandedId === t.id
        return (
          <li
            key={t.id}
            data-expanded={isExpanded || undefined}
            className="col-span-full grid grid-cols-subgrid transition-opacity duration-200 ease-out [ul:has(>li[data-expanded])>&:not([data-expanded])]:opacity-40 [ul:has(>li[data-expanded])>&:not([data-expanded]):hover]:opacity-100"
          >
            <Row
              orgSlug={orgSlug}
              slug={slug}
              ticket={t}
              members={members}
              isExpanded={isExpanded}
              onToggle={() => onExpand(isExpanded ? null : t.id)}
              focusBody={focusBody && isExpanded}
              onConsumeFocusBody={onConsumeFocusBody}
            />
          </li>
        )
      })}
    </ul>
  )
}

function Row({
  orgSlug,
  slug,
  ticket,
  members,
  isExpanded,
  onToggle,
  focusBody,
  onConsumeFocusBody
}: {
  orgSlug: string
  slug: string
  ticket: Ticket
  members: ReadonlyArray<Member>
  isExpanded: boolean
  onToggle: () => void
  focusBody: boolean
  onConsumeFocusBody: () => void
}) {
  const rowRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!focusBody || !isExpanded) return
    rowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [focusBody, isExpanded])
  return (
    <div ref={rowRef} className="col-span-full grid grid-cols-subgrid">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className={cn(
          "col-span-full grid grid-cols-subgrid items-center gap-3 px-3 py-2.5 text-left transition-colors",
          isExpanded ? "bg-accent/40" : "hover:bg-accent/30"
        )}
      >
        <StatusButton
          orgSlug={orgSlug}
          slug={slug}
          ticket={ticket}
          stopPropagation
        />
        <PriorityButton
          orgSlug={orgSlug}
          slug={slug}
          ticket={ticket}
          stopPropagation
        />
        <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
          {ticket.id}
        </span>
        <span className="min-w-0 truncate text-sm font-medium">
          {ticket.title}
        </span>
        <TicketGitChip orgSlug={orgSlug} slug={slug} ticketId={ticket.id} />
        <AssigneeRowTrigger
          orgSlug={orgSlug}
          slug={slug}
          ticket={ticket}
          members={members}
          className="hidden sm:inline-flex"
        />
        <TypeButton
          orgSlug={orgSlug}
          slug={slug}
          ticket={ticket}
          className="hidden sm:inline-flex"
        />
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            isExpanded && "rotate-180"
          )}
          strokeWidth={1.75}
        />
      </button>
      {isExpanded && (
        <div className="col-span-full">
          <Expanded
            orgSlug={orgSlug}
            slug={slug}
            id={ticket.id}
            members={members}
            focusBody={focusBody}
            onConsumeFocusBody={onConsumeFocusBody}
          />
        </div>
      )}
    </div>
  )
}

function NoTicketsYet() {
  return (
    <Empty
      className={cn(EMPTY_BORDER, "rounded-xl bg-background/50 px-4 py-10")}
    >
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ListChecks strokeWidth={1.75} />
        </EmptyMedia>
        <EmptyTitle className="text-sm font-medium">
          {m.tickets_empty_title()}
        </EmptyTitle>
        <EmptyDescription className="max-w-xs text-xs">
          {m.tickets_empty_hint_prefix()}{" "}
          <span className="font-mono">tickets/</span>.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function NoSearchMatches({
  orgSlug,
  slug,
  query
}: {
  orgSlug: string
  slug: string
  query: string
}) {
  const setQuery = useAtomSet(queryAtom(ticketListUiKey(orgSlug, slug)))
  return (
    <Empty className={cn(EMPTY_BORDER, "rounded-xl px-4 py-6 gap-2")}>
      <EmptyDescription>
        {m.tickets_no_search_matches_prefix()}{" "}
        <span className="font-mono text-foreground">"{query}"</span>.
      </EmptyDescription>
      <Button
        type="button"
        variant="tertiary"
        size="xs"
        leadingIcon={X}
        onClick={() => setQuery("")}
      >
        {m.tickets_clear_search_button()}
      </Button>
    </Empty>
  )
}
