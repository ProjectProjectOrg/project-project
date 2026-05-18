import { useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { Link } from "@tanstack/react-router"
import { type ReactNode } from "react"
import { Loader2, X } from "lucide-react"
import { TicketGitChip } from "@/components/TicketGit"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription } from "@/components/ui/empty"
import { loadMoreTicketsAtom } from "@/atoms/tickets"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import type { Group, Member, Ticket, TicketId } from "@projectproject/shared"
import { AssigneeRowTrigger } from "./AssigneeField"
import { PriorityButton } from "./PriorityField"
import { SprintField } from "./SprintField"
import { StatusButton } from "./StatusField"
import { TypeButton } from "./TypeField"
import { useResetTicketSearch } from "./url"

const EMPTY_BORDER = "border border-dashed border-border"

export function FilteredList({
  orgSlug,
  slug,
  listKey,
  items,
  nextCursor,
  waiting,
  members,
  extraRowActions,
  sprintMembership,
  hasActiveFilter
}: {
  orgSlug: string
  slug: string
  listKey: string
  items: ReadonlyArray<Ticket>
  nextCursor: string | null
  waiting: boolean
  members: ReadonlyArray<Member>
  extraRowActions?: (ticket: Ticket) => ReactNode
  sprintMembership?: ReadonlyMap<TicketId, Group>
  hasActiveFilter: boolean
}) {
  const loadMore = useAtomSet(loadMoreTicketsAtom(listKey))
  const loadMoreState = useAtomValue(loadMoreTicketsAtom(listKey))
  const loadingMore = loadMoreState.waiting === true
  const resetFilters = useResetTicketSearch()

  if (items.length === 0) {
    if (hasActiveFilter) {
      return (
        <Empty
          variant="inline"
          className={cn(EMPTY_BORDER, "gap-3 rounded-xl px-4 py-6")}
        >
          <EmptyDescription>{m.tickets_no_filter_matches()}</EmptyDescription>
          <Button
            type="button"
            variant="tertiary"
            size="xs"
            leadingIcon={X}
            onClick={resetFilters}
          >
            {m.tickets_filters_clear_all()}
          </Button>
        </Empty>
      )
    }
    return <NoTicketsYet />
  }

  const showSprintCol =
    sprintMembership !== undefined &&
    items.some((t) => sprintMembership.get(t.id) !== undefined)
  const showExtraActionsCol = extraRowActions !== undefined
  const gridCols = cn(
    "grid divide-y divide-border rounded-xl border border-border bg-background",
    showExtraActionsCol
      ? "grid-cols-[auto_auto_auto_minmax(0,1fr)_auto_auto]"
      : "grid-cols-[auto_auto_auto_minmax(0,1fr)_auto]",
    waiting && "animate-pulse"
  )

  return (
    <div className="flex flex-col gap-3">
      <ul className={gridCols}>
        {items.map((t) => {
          const membership = sprintMembership?.get(t.id) ?? null
          return (
            <li key={t.id} className="col-span-full grid grid-cols-subgrid">
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
      {nextCursor !== null && (
        <Button
          type="button"
          variant="tertiary"
          size="sm"
          onClick={() => loadMore()}
          disabled={loadingMore}
          className="self-center"
        >
          {loadingMore ? (
            <>
              <Loader2 className="size-4 animate-spin" strokeWidth={1.75} />
              {m.tickets_load_more_loading()}
            </>
          ) : (
            m.tickets_load_more_button()
          )}
        </Button>
      )}
    </div>
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
      <EmptyDescription className="max-w-xs text-xs">
        {m.tickets_empty_hint_prefix()}{" "}
        <span className="font-mono">{m.tickets_empty_hint_folder()}</span>.
      </EmptyDescription>
    </Empty>
  )
}
