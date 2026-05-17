import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { Link } from "@tanstack/react-router"
import { useMemo, type ReactNode } from "react"
import { ListChecks, X } from "lucide-react"
import { TicketGitChip } from "@/components/TicketGit"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle
} from "@/components/ui/empty"
import { meAtom } from "@/atoms/auth"
import {
  assigneeFilterAtom,
  queryAtom,
  selectedTagsAtom,
  sortKeyAtom,
  sprintFilterAtom,
  statusFilterAtom,
  ticketListUiKey,
  typeFilterAtom
} from "@/atoms/ticketListUi"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import type { Group, Member, Ticket, TicketId } from "@projectproject/shared"
import { AssigneeRowTrigger } from "./AssigneeField"
import { PriorityButton } from "./PriorityField"
import { SORTS } from "./sort"
import { SprintField } from "./SprintField"
import { StatusButton } from "./StatusField"
import { TypeButton } from "./TypeField"

const EMPTY_BORDER = "border border-dashed border-border"

export function FilteredList({
  orgSlug,
  slug,
  tickets,
  members,
  uiKey,
  extraRowActions,
  sprintMembership
}: {
  orgSlug: string
  slug: string
  tickets: ReadonlyArray<Ticket>
  members: ReadonlyArray<Member>
  uiKey?: string
  extraRowActions?: (ticket: Ticket) => ReactNode
  sprintMembership?: ReadonlyMap<TicketId, Group>
}) {
  const key = uiKey ?? ticketListUiKey(orgSlug, slug)
  const query = useAtomValue(queryAtom(key))
  const statusFilter = useAtomValue(statusFilterAtom(key))
  const typeFilter = useAtomValue(typeFilterAtom(key))
  const assigneeFilter = useAtomValue(assigneeFilterAtom(key))
  const selectedTags = useAtomValue(selectedTagsAtom(key))
  const sprintFilter = useAtomValue(sprintFilterAtom(key))
  const sortKey = useAtomValue(sortKeyAtom(key))
  const me = useAtomValue(meAtom)
  const myId = Result.isSuccess(me) ? me.value.id : null

  const resolvedAssignee: string =
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
        if (sprintFilter === "all") return true
        const m = sprintMembership?.get(t.id) ?? null
        if (sprintFilter === "unassigned") return m === null
        return m?.id === sprintFilter
      })
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
    sprintFilter,
    sprintMembership,
    sortKey
  ])

  if (tickets.length === 0) return <NoTicketsYet />

  if (filtered.length === 0) {
    if (query.trim().length > 0) {
      return <NoSearchMatches orgSlug={orgSlug} slug={slug} query={query} />
    }
    return (
      <Empty variant="inline" className={cn(EMPTY_BORDER, "p-6")}>
        <EmptyDescription>{m.tickets_no_filter_matches()}</EmptyDescription>
      </Empty>
    )
  }

  const showSprintCol =
    sprintMembership !== undefined &&
    filtered.some((t) => sprintMembership.get(t.id) !== undefined)
  const showExtraActionsCol = extraRowActions !== undefined
  const gridCols = cn(
    "grid divide-y divide-border rounded-xl border border-border bg-background",
    showExtraActionsCol
      ? "grid-cols-[auto_auto_auto_minmax(0,1fr)_auto_auto]"
      : "grid-cols-[auto_auto_auto_minmax(0,1fr)_auto]"
  )
  return (
    <ul className={gridCols}>
      {filtered.map((t) => {
        const membership = sprintMembership?.get(t.id) ?? null
        return (
          <li
            key={t.id}
            className="col-span-full grid grid-cols-subgrid"
          >
            <Row
              orgSlug={orgSlug}
              slug={slug}
              ticket={t}
              members={members}
              showSprintCol={showSprintCol}
              showExtraActionsCol={showExtraActionsCol}
              sprintMembership={membership}
              extraRowActions={extraRowActions}
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
  showSprintCol,
  showExtraActionsCol,
  sprintMembership,
  extraRowActions
}: {
  orgSlug: string
  slug: string
  ticket: Ticket
  members: ReadonlyArray<Member>
  showSprintCol: boolean
  showExtraActionsCol: boolean
  sprintMembership: Group | null
  extraRowActions?: (ticket: Ticket) => ReactNode
}) {
  return (
    <div className="group/list-row col-span-full grid grid-cols-subgrid">
      <Link
        to="/orgs/$orgSlug/projects/$slug/tickets/$id"
        params={{ orgSlug, slug, id: ticket.id }}
        className={cn(
          "col-span-full grid cursor-pointer grid-cols-subgrid items-center gap-3 px-3 py-2.5 text-left outline-none transition-colors hover:bg-accent/30 focus-visible:ring-1 focus-visible:ring-ring",
          "[li:first-child_&]:rounded-t-xl",
          "[li:last-child_&]:rounded-b-xl"
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
        <div className="flex min-w-0 items-center">
          <span className="min-w-0 truncate text-sm font-medium">
            {ticket.title}
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-2 pl-3">
            <TicketGitChip
              orgSlug={orgSlug}
              slug={slug}
              ticketId={ticket.id}
            />
            {showSprintCol && (
              <SprintField
                orgSlug={orgSlug}
                slug={slug}
                ticketId={ticket.id}
                membership={sprintMembership}
              />
            )}
            <AssigneeRowTrigger
              orgSlug={orgSlug}
              slug={slug}
              ticket={ticket}
              members={members}
              className="hidden sm:inline-flex"
            />
          </div>
        </div>
        <TypeButton
          orgSlug={orgSlug}
          slug={slug}
          ticket={ticket}
          className="hidden sm:inline-flex"
        />
        {showExtraActionsCol && (
          <span
            className="inline-flex shrink-0 items-center"
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
            }}
          >
            {extraRowActions?.(ticket)}
          </span>
        )}
      </Link>
    </div>
  )
}

function NoTicketsYet() {
  return (
    <Empty>
      <EmptyMedia variant="icon" className="mb-1">
        <ListChecks strokeWidth={1.75} className="size-5" />
      </EmptyMedia>
      <EmptyTitle className="text-sm font-medium">
        {m.tickets_empty_title()}
      </EmptyTitle>
      <EmptyDescription className="max-w-xs text-xs">
        {m.tickets_empty_hint_prefix()}{" "}
        <span className="font-mono">{m.tickets_empty_hint_folder()}</span>.
      </EmptyDescription>
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
    <Empty variant="inline" className={cn(EMPTY_BORDER, "rounded-xl px-4 py-6 gap-2")}>
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
