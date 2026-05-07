import { useEffect, useMemo, useRef } from "react"
import { ChevronDown, ListChecks, X } from "lucide-react"
import { TicketGitChip } from "@/components/TicketGit"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import type {
  Member,
  Ticket,
  TagName,
  TicketId,
  TicketStatus,
  TicketType
} from "@projectproject/shared"
import { AssigneeRowTrigger } from "./AssigneeField"
import { Expanded } from "./Expanded"
import { PriorityButton } from "./PriorityField"
import { SORTS, type SortKey } from "./sort"
import { StatusButton } from "./StatusField"
import { TypeButton } from "./TypeField"

export function FilteredList({
  orgSlug,
  slug,
  tickets,
  query,
  onClearSearch,
  statusFilter,
  typeFilter,
  assigneeFilter,
  selectedTags,
  sortKey,
  expandedId,
  onExpand,
  focusBody,
  onConsumeFocusBody,
  members
}: {
  orgSlug: string
  slug: string
  tickets: ReadonlyArray<Ticket>
  query: string
  onClearSearch: () => void
  statusFilter: TicketStatus | "all"
  typeFilter: TicketType | "all"
  assigneeFilter: "all" | "unassigned" | string
  selectedTags: ReadonlyArray<TagName>
  sortKey: SortKey
  expandedId: TicketId | null
  onExpand: (id: TicketId | null) => void
  focusBody: boolean
  onConsumeFocusBody: () => void
  members: ReadonlyArray<Member>
}) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tickets
      .filter((t) => statusFilter === "all" || t.status === statusFilter)
      .filter((t) => typeFilter === "all" || t.type === typeFilter)
      .filter((t) =>
        assigneeFilter === "all"
          ? true
          : assigneeFilter === "unassigned"
            ? t.assignees.length === 0
            : t.assignees.includes(assigneeFilter)
      )
      .filter((t) => selectedTags.every((sel) => t.tags.includes(sel)))
      .filter((t) => {
        if (!q) return true
        return (
          t.title.toLowerCase().includes(q) || t.id.toLowerCase().includes(q)
        )
      })
      .slice()
      .sort(SORTS[sortKey].compare)
  }, [
    tickets,
    query,
    statusFilter,
    typeFilter,
    assigneeFilter,
    selectedTags,
    sortKey
  ])

  if (tickets.length === 0) {
    return <NoTicketsYet />
  }
  if (filtered.length === 0) {
    if (query.trim().length > 0) {
      return (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          <span>
            {m.tickets_no_search_matches_prefix()}{" "}
            <span className="font-mono text-foreground">"{query}"</span>.
          </span>
          <Button
            type="button"
            variant="tertiary"
            size="xs"
            leadingIcon={X}
            onClick={onClearSearch}
          >
            {m.tickets_clear_search_button()}
          </Button>
        </div>
      )
    }
    return <Empty>{m.tickets_no_filter_matches()}</Empty>
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
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-background/50 px-4 py-10 text-center">
      <div className="grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground">
        <ListChecks className="size-5" strokeWidth={1.75} />
      </div>
      <div className="text-sm font-medium">{m.tickets_empty_title()}</div>
      <p className="max-w-xs text-xs text-muted-foreground">
        {m.tickets_empty_hint_prefix()}{" "}
        <span className="font-mono">tickets/</span>.
      </p>
    </div>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}
