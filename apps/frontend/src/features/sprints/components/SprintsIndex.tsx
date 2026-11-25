import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import { GroupPolicy } from "@pp/access/policies"
import { sprintState, type Group } from "@pp/shared"
import { Button } from "@pp/ui/button"
import { Chip } from "@pp/ui/chip"
import { Play } from "@pp/ui/icons"
import { ItemLink } from "@pp/ui/item-link"
import { cn } from "@pp/ui/lib/utils"
import {
  ListHoverScope,
  ListRow,
  ListRowTitle,
  listGridClassName
} from "@pp/ui/list-row"
import { ListSectionBody, ListSectionHeader } from "@pp/ui/list-section"
import { ProgressCount } from "@pp/ui/progress-count"
import { ShortcutTooltip } from "@pp/ui/tooltip"
import { getRouteApi, Link } from "@tanstack/react-router"
import { useState } from "react"

import { AsyncView } from "@/components/shell/AsyncView"
import { PageContainer } from "@/components/shell/Page"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  sprintList,
  sprintListRequest,
  updateSprint
} from "@/features/sprints/atoms/sprintList"
import { useSprintPhaseCounts } from "@/features/sprints/hooks/useSprintPhaseCounts"
import { nowDate, startSprintPatch } from "@/features/sprints/lib/sprintDates"
import { sprintOverview } from "@/features/sprints/lib/sprintOverview"
import {
  SPRINT_STATE_META,
  sprintStatusText
} from "@/features/sprints/lib/sprintPresentation"
import { sprintSectionAnchor } from "@/features/tickets/lib/sprintSectionAnchor"
import { useProjectActor } from "@/hooks/useActor"
import { appHotkeys } from "@/lib/appHotkeys"
import { keyLabels } from "@/lib/keyLabels"
import { m } from "@/paraglide/messages"

import { NewSprintButton } from "./NewSprintButton"
import { SprintStateIcon } from "./SprintChip"
import { SprintDatesField } from "./SprintHeaderFields"
import { SprintListKeyboard } from "./SprintListKeyboard"
import { SprintContextMenu } from "./SprintMenu"
import { SprintsEmpty } from "./SprintsEmpty"

const routeApi = getRouteApi(
  "/_authed/orgs/$orgSlug/projects/$slug/_projectHeader/sprints/"
)

type SprintStateName = ReturnType<typeof sprintState>

export function SprintsIndex() {
  const { orgSlug, slug } = routeApi.useParams()
  const req = sprintListRequest(orgSlug, slug)
  const list = useAtomValue(sprintList(req))
  const refresh = useAtomRefresh(sprintList(req))
  const canPlan = GroupPolicy.can(useProjectActor(), "sprint", "manage")

  return (
    <AsyncView
      result={list}
      contained
      reset={refresh}
      onInitial={() => <OverviewSkeleton />}
      onSuccess={({ value }) =>
        value.length === 0 ? (
          <PageContainer>
            <SprintsEmpty>
              {canPlan && <NewSprintButton variant="primary" />}
            </SprintsEmpty>
          </PageContainer>
        ) : (
          <Overview sprints={value} canPlan={canPlan} />
        )
      }
    />
  )
}

function Overview({
  sprints,
  canPlan
}: Readonly<{ sprints: ReadonlyArray<Group>; canPlan: boolean }>) {
  const now = nowDate()
  const { active, upcoming, completed } = sprintOverview(sprints, now)

  return (
    <PageContainer className="gap-3 pb-10">
      <SprintListKeyboard>
        <ListHoverScope className="flex flex-col gap-1">
          <SprintSection
            state="active"
            label={m.sprints_overview_current_heading()}
            sprints={active}
            now={now}
            canPlan={canPlan}
            allSprints={sprints}
          />
          <SprintSection
            state="planned"
            label={m.sprints_overview_upcoming_heading()}
            sprints={upcoming}
            now={now}
            canPlan={canPlan}
            allSprints={sprints}
            canStart={canPlan && active.length === 0}
          />
          <SprintSection
            state="completed"
            label={m.sprints_overview_completed_heading()}
            sprints={completed}
            now={now}
            canPlan={canPlan}
            allSprints={sprints}
            startCollapsed
          />
        </ListHoverScope>
      </SprintListKeyboard>
    </PageContainer>
  )
}

function SprintSection({
  state,
  label,
  sprints,
  allSprints,
  now,
  canPlan,
  canStart = false,
  startCollapsed = false
}: Readonly<{
  state: SprintStateName
  label: string
  sprints: ReadonlyArray<Group>
  allSprints: ReadonlyArray<Group>
  now: Date
  canPlan: boolean
  canStart?: boolean
  startCollapsed?: boolean
}>) {
  const [collapsed, setCollapsed] = useState(startCollapsed)
  if (sprints.length === 0) return null
  const { icon: Icon, className } = SPRINT_STATE_META[state]
  return (
    <section className="flex flex-col">
      <ListSectionHeader
        icon={<Icon className={cn("size-4", className)} strokeWidth={1.75} />}
        label={label}
        count={sprints.length}
        countLabel={m.sprints_overview_count_aria_label({
          count: sprints.length
        })}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((current) => !current)}
        collapseLabel={m.sprints_overview_collapse_aria_label({ label })}
      />
      <ListSectionBody collapsed={collapsed}>
        <div className={listGridClassName}>
          {sprints.map((sprint, index) => (
            <SprintRow
              key={sprint.id}
              sprint={sprint}
              sprints={allSprints}
              now={now}
              canPlan={canPlan}
              canStart={canStart && index === 0}
            />
          ))}
        </div>
      </ListSectionBody>
    </section>
  )
}

function SprintRow({
  sprint,
  sprints,
  now,
  canPlan,
  canStart
}: Readonly<{
  sprint: Group
  sprints: ReadonlyArray<Group>
  now: Date
  canPlan: boolean
  canStart: boolean
}>) {
  const state = sprintState(sprint, now)
  const status = sprintStatusText(sprint, now)
  const row = (
    <ListRow
      data-sprint-row
      link={<SprintLink sprint={sprint} state={state} />}
      status={<SprintStateIcon sprint={sprint} now={now} size="md" />}
      title={
        <span className="flex min-w-0 items-baseline gap-2">
          <ListRowTitle variant={state === "active" ? "default" : "quiet"}>
            {sprint.name}
          </ListRowTitle>
          {status !== null && (
            <span className="hidden shrink-0 text-caption text-muted-foreground @md/list:inline">
              {status}
            </span>
          )}
        </span>
      }
      trailing={
        <>
          <SprintDatesField
            sprint={sprint}
            disabled={!canPlan || state === "completed"}
          />
          {state === "active" ? (
            <ActiveProgress sprint={sprint} />
          ) : (
            <Chip className="tabular-nums">
              {m.sprints_overview_ticket_count({
                count: sprint.tickets.length
              })}
            </Chip>
          )}
        </>
      }
      estimate={canStart ? <StartNowButton sprint={sprint} now={now} /> : null}
    />
  )
  return canPlan ? (
    <SprintContextMenu sprint={sprint} sprints={sprints}>
      {row}
    </SprintContextMenu>
  ) : (
    row
  )
}

function SprintLink({
  sprint,
  state
}: Readonly<{ sprint: Group; state: SprintStateName }>) {
  const { orgSlug, slug } = useProjectRoute()
  return (
    <ItemLink
      aria-label={sprint.name}
      render={
        state === "planned" ? (
          <Link
            to="/orgs/$orgSlug/projects/$slug"
            params={{ orgSlug, slug }}
            search={{ view: "list", group: "sprint" }}
            hash={sprintSectionAnchor(sprint.id)}
          />
        ) : (
          <Link
            to="/orgs/$orgSlug/projects/$slug/sprints/$groupId"
            params={{ orgSlug, slug, groupId: sprint.id }}
          />
        )
      }
    />
  )
}

function ActiveProgress({ sprint }: Readonly<{ sprint: Group }>) {
  const counts = useSprintPhaseCounts(sprint.id)
  if (counts === null) return null
  const { finished, total } = counts
  return (
    <Chip shape="count">
      <ProgressCount
        done={finished}
        total={total}
        label={m.sprints_overview_progress_label({ done: finished, total })}
        tone="inherit"
      />
    </Chip>
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
    <ShortcutTooltip
      hotkey={appHotkeys["sprints.start"]}
      keyLabels={keyLabels()}
    >
      <Button
        variant="tertiary"
        size="xs"
        leadingIcon={Play}
        data-sprint-start
        onClick={() => update(startSprintPatch(sprint, now))}
      >
        {m.sprints_overview_start()}
      </Button>
    </ShortcutTooltip>
  )
}

function OverviewSkeleton() {
  return (
    <PageContainer className="gap-3" aria-busy="true">
      <div className="h-10 animate-pulse rounded-xl bg-muted/60 motion-reduce:animate-none" />
      <div className="h-40 animate-pulse rounded-lg bg-muted/40 motion-reduce:animate-none" />
    </PageContainer>
  )
}
