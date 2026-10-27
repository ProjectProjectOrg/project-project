import { useAtomValue } from "@effect/atom-react"
import {
  pickActiveSprint,
  pickEarliestPlannedSprint,
  sprintState,
  type Group
} from "@pp/shared"
import { Link, useParams } from "@tanstack/react-router"
import * as DateTime from "effect/DateTime"
import * as Result from "effect/reactivity/AsyncResult"
import { Plus } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"

import { RailBackLink } from "@/components/shell/RailBackLink"
import { InlineForm } from "@/components/ui/inline-form"
import {
  project as projectView,
  projectRequest
} from "@/features/projects/atoms/projects"
import { ProjectIconDisplay } from "@/features/projects/components/ProjectIconDisplay"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  sprintList,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import { CreateSprintForm } from "@/features/sprints/forms/create-sprint"
import { formatSprintRange } from "@/features/sprints/lib/sprintDates"
import { transitions } from "@/lib/springs"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { SprintStateIcon } from "./SprintChip"

function formatRange(s: Group): string {
  if (!s.startsAt || !s.endsAt) return ""
  return formatSprintRange(s.startsAt, s.endsAt)
}
function sprintProjectLayoutId(orgSlug: string, slug: string) {
  return `project-settings-row:${orgSlug}/${slug}`
}

function sortByStart(a: Group, b: Group) {
  return (a.startsAt?.getTime() ?? 0) - (b.startsAt?.getTime() ?? 0)
}

export function SprintRail({ canPlan }: { canPlan: boolean }) {
  const { orgSlug, slug } = useProjectRoute()
  const req = sprintListRequest(orgSlug, slug)
  const project = useAtomValue(projectView(projectRequest(orgSlug, slug)))
  const projectName = Result.isSuccess(project) ? project.value.name : slug
  const projectIcon = Result.isSuccess(project) ? project.value.icon : null
  const projectIconImage = Result.isSuccess(project)
    ? project.value.iconImage
    : null
  const reduceMotion = useReducedMotion()
  const list = useAtomValue(sprintList(req))
  const sprints = Result.isSuccess(list) ? list.value : []
  const params = useParams({ strict: false }) as { groupId?: string }
  const selectedSprintId =
    params.groupId ?? pickSprintNavigationTarget(sprints)?.id
  const now = DateTime.toDate(DateTime.nowUnsafe())

  const active: Array<Group> = []
  const planned: Array<Group> = []
  const completed: Array<Group> = []
  for (const s of sprints) {
    const state = sprintState(s, now)
    if (state === "active") active.push(s)
    else if (state === "planned") planned.push(s)
    else completed.push(s)
  }
  active.sort(sortByStart)
  planned.sort(sortByStart)
  completed.sort(
    (a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0)
  )

  return (
    <div className="flex h-full flex-col gap-4">
      <RailBackLink
        to="/orgs/$orgSlug/projects/$slug"
        params={{ orgSlug, slug }}
        label={m.sprints_rail_section_label()}
      />
      <motion.div
        layoutId={
          reduceMotion ? undefined : sprintProjectLayoutId(orgSlug, slug)
        }
        transition={transitions.layout}
        className="flex items-center gap-2.5 rounded-lg bg-accent/60 px-3 py-2 text-[13px] text-foreground"
      >
        {projectIcon ? (
          <span
            aria-hidden
            className="inline-flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-[4px] text-[13px] leading-none corner-squircle"
          >
            <ProjectIconDisplay
              orgSlug={orgSlug}
              icon={projectIcon}
              iconImage={projectIconImage}
              size={16}
            />
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate font-medium">
          {projectName}
        </span>
      </motion.div>
      {canPlan && <NewSprintForm />}
      <div className="flex flex-col gap-5 overflow-y-auto">
        <Section
          label={m.sprints_active_label()}
          count={active.length}
          sprints={active}
          selectedSprintId={selectedSprintId}
        />
        <Section
          label={m.sprints_planned_label()}
          count={planned.length}
          sprints={planned}
          selectedSprintId={selectedSprintId}
        />
        <Section
          label={m.sprints_completed_label()}
          count={completed.length}
          sprints={completed}
          selectedSprintId={selectedSprintId}
          dim
        />
      </div>
    </div>
  )
}

function Section({
  label,
  count,
  sprints,
  selectedSprintId,

  dim
}: {
  label: string
  count: number
  sprints: ReadonlyArray<Group>
  selectedSprintId?: string
  dim?: boolean
}) {
  if (count === 0) return null
  return (
    <section className="flex flex-col gap-1">
      <header className="flex items-center justify-between px-2 text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono text-[10px] tabular-nums">{count}</span>
      </header>
      <ul className={cn("flex flex-col", dim && "opacity-80")}>
        {sprints.map((s) => (
          <li key={s.id}>
            <RailRow sprint={s} selected={selectedSprintId === s.id} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function RailRow({ sprint, selected }: { sprint: Group; selected: boolean }) {
  const { orgSlug, slug } = useProjectRoute()
  return (
    <Link
      to="/orgs/$orgSlug/projects/$slug/sprints/$groupId"
      params={{ orgSlug, slug, groupId: sprint.id }}
      className={cn(
        "group/list-row flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors",
        selected
          ? "bg-accent font-medium text-foreground"
          : "text-muted-foreground hover:bg-hover hover:text-foreground"
      )}
      aria-current={selected ? "page" : undefined}
    >
      <SprintStateIcon sprint={sprint} />
      <span className="min-w-0 flex-1 truncate">{sprint.name}</span>
      <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
        {formatRange(sprint)}
      </span>
    </Link>
  )
}

function pickSprintNavigationTarget(
  sprints: ReadonlyArray<Group>
): Group | null {
  const active = pickActiveSprint(sprints)
  if (active) return active
  const planned = pickEarliestPlannedSprint(sprints)
  if (planned) return planned
  const completed = sprints
    .filter((s) => s.completedAt !== null)
    .toSorted(
      (a, b) =>
        (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0)
    )
  return completed[0] ?? null
}

function NewSprintForm() {
  const Root = InlineForm.Root<"create">
  return (
    <Root
      actions={["create"]}
      className="data-[mode=idle]:border-0 data-[mode=idle]:bg-transparent data-[mode=idle]:p-0"
    >
      <InlineForm.Idle block>
        <InlineForm.Trigger
          action="create"
          variant="dither"
          className="w-full justify-start text-primary-foreground"
          leadingIcon={Plus}
          ditherFrom="var(--primary)"
          ditherTo="var(--background)"
          ditherDirection="r"
          ditherStops={[0.7, 1]}
          ditherHoverStops={[0.5, 1]}
        >
          {m.sprints_new_button()}
        </InlineForm.Trigger>
      </InlineForm.Idle>
      <InlineForm.Form action="create">
        <CreateSprintForm />
      </InlineForm.Form>
    </Root>
  )
}
