import { useAtomSet } from "@effect/atom-react"
import { sprintState, type Group } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import { ChevronRight, Play } from "lucide-react"
import { createContext, use, useRef, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { FluidHoverHighlight } from "@/components/ui/fluid-hover-highlight"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  sprintListRequest,
  updateSprint
} from "@/features/sprints/atoms/sprintList"
import { useSprintPhaseCounts } from "@/features/sprints/hooks/useSprintPhaseCounts"
import {
  formatSprintDates,
  sprintDateDraft,
  sprintLengthAdjective,
  sprintLengthDays,
  startSprintPatch
} from "@/features/sprints/lib/sprintDates"
import { sprintSectionAnchor } from "@/features/tickets/lib/sprintSectionAnchor"
import { useFluidHover, useRegisterFluidHoverItem } from "@/hooks/useFluidHover"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { sprintStatusText, SprintStateIcon } from "./SprintChip"
import { PhaseBar } from "./SprintProgress"

const ROW_GRID =
  "grid-cols-[auto_minmax(0,1fr)_auto] sm:grid-cols-[auto_minmax(0,1fr)_10rem_9rem_5.5rem_5.5rem]"

const sprintDates = (sprint: Group): string =>
  formatSprintDates(sprintDateDraft(sprint)) ?? m.sprints_not_scheduled()

const lengthLabel = (sprint: Group): string | null => {
  const days = sprintLengthDays(sprint)
  return days === null ? null : sprintLengthAdjective(days)
}

const LedgerHoverContext = createContext<
  ((index: number, element: HTMLElement | null) => void) | undefined
>(undefined)

export function LedgerList({ children }: Readonly<{ children: ReactNode }>) {
  const listRef = useRef<HTMLDivElement>(null)
  const hover = useFluidHover(listRef)
  return (
    <LedgerHoverContext value={hover.registerItem}>
      <div
        ref={listRef}
        role="presentation"
        onMouseEnter={hover.handlers.onMouseEnter}
        onMouseMove={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest("[data-ledger-row]") !== null
          )
            hover.handlers.onMouseMove(event)
          else hover.handlers.onMouseLeave()
        }}
        onMouseLeave={hover.handlers.onMouseLeave}
        onClick={hover.handlers.onClick}
        className="relative flex flex-col gap-6"
      >
        <FluidHoverHighlight hover={hover} className="rounded-md" />
        {children}
      </div>
    </LedgerHoverContext>
  )
}

export function LedgerGroup({
  title,
  count,
  action,
  children
}: Readonly<{
  title: string
  count: number
  action?: ReactNode
  children: ReactNode
}>) {
  return (
    <section className="flex flex-col">
      <div className="mb-1 flex h-9 items-center justify-between gap-3 border-b border-border/60 px-3">
        <h2 className="flex items-baseline gap-2 text-caption font-semibold">
          {title}
          <span className="font-normal text-muted-foreground tabular-nums">
            {count}
          </span>
        </h2>
        {action}
      </div>
      <ul className="flex flex-col">{children}</ul>
    </section>
  )
}

export function LedgerRow({
  sprint,
  now,
  canStart,
  index
}: Readonly<{ sprint: Group; now: Date; canStart: boolean; index: number }>) {
  const { orgSlug, slug } = useProjectRoute()
  const state = sprintState(sprint, now)
  const ref = useRef<HTMLLIElement>(null)
  useRegisterFluidHoverItem(use(LedgerHoverContext), index, ref)
  return (
    <li
      ref={ref}
      data-ledger-row
      className={cn(
        "group/reveal relative grid min-h-11 items-center gap-x-4 rounded-md px-3 py-1.5",
        ROW_GRID
      )}
    >
      <SprintStateIcon sprint={sprint} now={now} size="md" />
      <Link
        {...(state === "planned"
          ? {
              to: "/orgs/$orgSlug/projects/$slug",
              params: { orgSlug, slug },
              search: { view: "list", group: "sprint" },
              hash: sprintSectionAnchor(sprint.id)
            }
          : {
              to: "/orgs/$orgSlug/projects/$slug/sprints/$groupId",
              params: { orgSlug, slug, groupId: sprint.id }
            })}
        className={cn(
          "truncate rounded-md text-body outline-none after:absolute after:inset-0 after:rounded-md focus-visible:after:ring-1 focus-visible:after:ring-ring",
          state === "active" ? "font-semibold" : "font-normal"
        )}
      >
        {sprint.name}
      </Link>
      <span className="hidden min-w-0 sm:block">
        {state === "active" ? (
          <ActiveProgress sprint={sprint} />
        ) : (
          <span className="block truncate text-caption text-muted-foreground">
            {state === "completed"
              ? sprintStatusText(sprint, now)
              : [lengthLabel(sprint), sprintStatusText(sprint, now)]
                  .filter((part) => part !== null)
                  .join(" · ")}
          </span>
        )}
      </span>
      <span className="hidden truncate text-caption tabular-nums sm:block">
        {sprintDates(sprint)}
      </span>
      <span className="hidden text-right text-caption text-muted-foreground tabular-nums sm:block">
        {m.sprints_overview_ticket_count({ count: sprint.tickets.length })}
      </span>
      <span className="flex justify-end">
        {canStart ? (
          <StartNowButton sprint={sprint} now={now} />
        ) : (
          <ChevronRight
            aria-hidden
            className="size-4 text-muted-foreground opacity-0 transition-opacity group-data-[fluid-hover-active]/reveal:opacity-100"
          />
        )}
      </span>
    </li>
  )
}

function ActiveProgress({ sprint }: Readonly<{ sprint: Group }>) {
  const counts = useSprintPhaseCounts(sprint.id)
  if (counts === null) {
    return (
      <span className="block h-1.5 w-full animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
    )
  }
  const { finished, started, total } = counts
  return (
    <span className="flex items-center gap-2.5 text-caption tabular-nums">
      <PhaseBar
        done={finished}
        started={started}
        total={total}
        className="h-1.5 flex-1"
      />
      <span>
        {m.sprints_overview_percent_done({
          percent: total === 0 ? 0 : Math.round((finished / total) * 100)
        })}
      </span>
    </span>
  )
}

function StartNowButton({
  sprint,
  now
}: Readonly<{ sprint: Group; now: Date }>) {
  const { orgSlug, slug } = useProjectRoute()
  const update = useAtomSet(
    updateSprint({ req: sprintListRequest(orgSlug, slug), groupId: sprint.id })
  )
  return (
    <Button
      variant="tertiary"
      size="xs"
      leadingIcon={Play}
      className="relative z-10"
      onClick={() => update(startSprintPatch(sprint, now))}
    >
      {m.sprints_overview_start()}
    </Button>
  )
}
