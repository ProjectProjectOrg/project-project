import { useAtomValue } from "@effect/atom-react"
import { GroupPolicy } from "@pp/access/policies"
import { sprintState, type Group, type Ticket } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Result from "effect/reactivity/AsyncResult"
import { CalendarRange, Info, ListChecks, Plus } from "lucide-react"
import { useRef, useState } from "react"

import { useNavHoverItem } from "@/components/shell/NavItem"
import {
  NavRow,
  Reveal,
  SectionHeader,
  ToggleRow
} from "@/components/shell/ProjectNavRows"
import { Button } from "@/components/ui/button"
import {
  sprintList,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import { NewSprintPopover } from "@/features/sprints/components/NewSprintPopover"
import {
  shortDateFormatter,
  SprintStateIcon,
  sprintStatusText
} from "@/features/sprints/components/SprintChip"
import { epicsRequest, projectEpics } from "@/features/tickets/atoms/epics"
import { useProjectActor } from "@/hooks/useActor"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export type ProjectRoute = Readonly<{
  page: "backlog" | "sprints" | "about" | "settings"
  sub: string | null
}>

export const STATIC_HOVER_INDEX = 1000

const HOVER = {
  backlog: 2,
  about: 3,
  completedToggle: 5,
  epicsToggle: 6,
  sprint: 100
} as const

const VISIBLE_EPICS = 3

export function ProjectNav({
  orgSlug,
  slug,
  route
}: {
  orgSlug: string
  slug: string
  route: ProjectRoute | null
}) {
  return (
    <div className="flex flex-col">
      <NavRow
        index={HOVER.backlog}
        to="/orgs/$orgSlug/projects/$slug"
        params={{ orgSlug, slug }}
        icon={<ListChecks className="size-4" strokeWidth={1.75} />}
        label={m.project_detail_tab_backlog()}
        active={route?.page === "backlog"}
      />
      <SprintsSection
        orgSlug={orgSlug}
        slug={slug}
        activeSprint={route?.page === "sprints" ? route.sub : null}
      />
      <EpicsSection orgSlug={orgSlug} slug={slug} />
      <div className="h-3" />
      <NavRow
        index={HOVER.about}
        to="/orgs/$orgSlug/projects/$slug/about"
        params={{ orgSlug, slug }}
        icon={<Info className="size-4" strokeWidth={1.75} />}
        label={m.project_detail_tab_about()}
        active={route?.page === "about"}
      />
    </div>
  )
}

function SprintsSection({
  orgSlug,
  slug,
  activeSprint
}: {
  orgSlug: string
  slug: string
  activeSprint: string | null
}) {
  const canPlan = GroupPolicy.can(useProjectActor(), "sprint", "manage")
  const result = useAtomValue(sprintList(sprintListRequest(orgSlug, slug)))
  const [showCompleted, setShowCompleted] = useState(false)
  const [creating, setCreating] = useState(false)
  if (!Result.isSuccess(result)) return null
  const now = DateTime.toDate(DateTime.nowUnsafe())
  const sprints = result.value
  const current = sprints
    .filter((s) => sprintState(s, now) !== "completed")
    .toSorted(byStart)
  const completed = sprints
    .filter((s) => sprintState(s, now) === "completed")
    .toSorted(
      (a, b) =>
        (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0)
    )
  const row = (sprint: Group, index: number) => (
    <NavRow
      key={sprint.id}
      index={HOVER.sprint + index}
      to="/orgs/$orgSlug/projects/$slug/sprints/$groupId"
      params={{ orgSlug, slug, groupId: sprint.id }}
      icon={<SprintStateIcon sprint={sprint} now={now} />}
      label={sprint.name}
      meta={sprintMeta(sprint, now)}
      active={activeSprint === sprint.id}
    />
  )

  return (
    <>
      <SectionHeader
        label={m.sprints_rail_section_label()}
        action={
          canPlan ? (
            <NewSprintPopover
              open={creating}
              onOpenChange={setCreating}
              trigger={
                <Button
                  variant="quiet"
                  size="square-7"
                  aria-label={m.sprints_new_button()}
                  title={m.sprints_new_button()}
                >
                  <Plus className="size-3.5" strokeWidth={1.75} />
                </Button>
              }
            />
          ) : null
        }
      />
      {current.map((sprint, index) => row(sprint, index))}
      {completed.length > 0 ? (
        <>
          <ToggleRow
            index={HOVER.completedToggle}
            open={showCompleted}
            onToggle={() => setShowCompleted((open) => !open)}
            label={m.sprints_completed_label()}
            meta={String(completed.length)}
          />
          <Reveal open={showCompleted}>
            <div className="flex flex-col pl-6">
              {completed.map((sprint, index) =>
                row(sprint, current.length + index)
              )}
            </div>
          </Reveal>
        </>
      ) : null}
      {sprints.length === 0 ? (
        <NavRow
          index={HOVER.sprint}
          to="/orgs/$orgSlug/projects/$slug/sprints"
          params={{ orgSlug, slug }}
          icon={<CalendarRange className="size-4" strokeWidth={1.75} />}
          label={m.sprints_empty_no_sprints_title()}
          active={activeSprint !== null}
        />
      ) : null}
    </>
  )
}

const byStart = (a: Group, b: Group) =>
  (a.startsAt?.getTime() ?? Number.MAX_SAFE_INTEGER) -
  (b.startsAt?.getTime() ?? Number.MAX_SAFE_INTEGER)

function sprintMeta(sprint: Group, now: Date): string | undefined {
  const state = sprintState(sprint, now)
  if (state === "active") return sprintStatusText(sprint, now) ?? undefined
  if (state === "planned" && sprint.startsAt)
    return shortDateFormatter().format(sprint.startsAt)
  return undefined
}

function EpicsSection({ orgSlug, slug }: { orgSlug: string; slug: string }) {
  const result = useAtomValue(projectEpics(epicsRequest(orgSlug, slug)))
  const [showAll, setShowAll] = useState(false)
  if (!Result.isSuccess(result) || result.value.length === 0) return null
  const epics = result.value.toSorted(
    (a, b) => Number(isFinished(a)) - Number(isFinished(b))
  )
  const visible = epics.slice(0, VISIBLE_EPICS)
  const hidden = epics.slice(VISIBLE_EPICS)
  return (
    <>
      <SectionHeader label={m.chrome_sidebar_epics_section_label()} />
      {visible.map((epic, index) => (
        <EpicRow key={epic.id} epic={epic} index={index} />
      ))}
      {hidden.length > 0 ? (
        <>
          <Reveal open={showAll}>
            <div className="flex flex-col">
              {hidden.map((epic, index) => (
                <EpicRow
                  key={epic.id}
                  epic={epic}
                  index={VISIBLE_EPICS + index}
                />
              ))}
            </div>
          </Reveal>
          <ToggleRow
            index={HOVER.epicsToggle}
            open={showAll}
            onToggle={() => setShowAll((open) => !open)}
            label={
              showAll
                ? m.chrome_sidebar_show_less()
                : m.chrome_sidebar_show_more({ count: hidden.length })
            }
          />
        </>
      ) : null}
    </>
  )
}

const subTickets = (epic: Ticket) => ({
  done: epic.subTicketDoneCount ?? 0,
  total: epic.subTicketCount ?? 0
})

const isFinished = (epic: Ticket) => {
  const { done, total } = subTickets(epic)
  return total > 0 && done === total
}

function EpicRow({ epic, index }: { epic: Ticket; index: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useNavHoverItem(STATIC_HOVER_INDEX + index, ref)
  const { done, total } = subTickets(epic)
  return (
    <div
      ref={ref}
      className="relative z-10 mb-1 flex items-center gap-2.5 px-3 py-2 text-body text-muted-foreground"
    >
      <ProgressRing done={done} total={total} />
      <span className="min-w-0 flex-1 truncate">{epic.title}</span>
      <span className="shrink-0 text-caption tabular-nums">
        {done}/{total}
      </span>
    </div>
  )
}

function ProgressRing({ done, total }: { done: number; total: number }) {
  const radius = 6
  const circumference = 2 * Math.PI * radius
  const share = total === 0 ? 0 : done / total
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className={cn(
        "size-4 shrink-0",
        share === 1 ? "text-state-success" : "text-muted-foreground"
      )}
    >
      <circle
        cx="8"
        cy="8"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.3}
        strokeWidth={1.75}
      />
      <circle
        cx="8"
        cy="8"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeDasharray={`${circumference * share} ${circumference}`}
        transform="rotate(-90 8 8)"
      />
    </svg>
  )
}
