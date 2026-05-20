import { useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { useNavigate } from "@tanstack/react-router"
import {
  memo,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode
} from "react"
import { FilterX, ListChecks, Loader2 } from "lucide-react"
import { TicketGitChip } from "@/components/TicketGit"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@/components/ui/empty"
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
  const loadingMore = loadMoreState.waiting
  const resetFilters = useResetTicketSearch()

  if (items.length === 0) {
    if (hasActiveFilter) {
      return (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FilterX strokeWidth={1.75} />
            </EmptyMedia>
            <EmptyTitle>{m.tickets_no_filter_matches_title()}</EmptyTitle>
            <EmptyDescription>{m.tickets_no_filter_matches()}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              type="button"
              variant="tertiary"
              size="sm"
              leadingIcon={FilterX}
              onClick={resetFilters}
            >
              {m.tickets_filters_clear_all()}
            </Button>
          </EmptyContent>
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

function RowImpl({
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
  const navigate = useNavigate()
  const open = () => {
    void navigate({
      to: "/orgs/$orgSlug/projects/$slug/tickets/$id",
      params: { orgSlug, slug, id: ticket.id }
    })
  }
  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    if (isInteractiveTarget(e.target, e.currentTarget)) return
    open()
  }
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter") return
    if (isInteractiveTarget(e.target, e.currentTarget)) return
    e.preventDefault()
    open()
  }

  return (
    <div className="group/list-row col-span-full grid grid-cols-subgrid">
      <div
        role="link"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
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
            <TicketGitChip orgSlug={orgSlug} slug={slug} ticket={ticket} />
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
      </div>
    </div>
  )
}

const Row = memo(RowImpl)

function isInteractiveTarget(
  target: EventTarget,
  row: HTMLDivElement
): boolean {
  if (!(target instanceof Element)) return false
  const interactive = target.closest(
    "a,button,input,select,textarea,[role='button'],[role='menuitem']"
  )
  return interactive !== null && row.contains(interactive)
}

function NoTicketsYet() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ListChecks strokeWidth={1.75} />
        </EmptyMedia>
        <EmptyTitle>{m.tickets_empty_title()}</EmptyTitle>
        <EmptyDescription>
          {m.tickets_empty_hint_prefix()}{" "}
          <span className="font-mono">{m.tickets_empty_hint_folder()}</span>.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
