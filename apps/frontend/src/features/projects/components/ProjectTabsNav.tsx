import { useAtomValue } from "@effect/atom-react"
import { activeAndPlannedCount, sprintState } from "@pp/shared"
import type {
  Group,
  ProjectDetail as ProjectDetailType,
  ProjectStatus
} from "@pp/shared"
import { Link, useMatches, useNavigate } from "@tanstack/react-router"
import * as DateTime from "effect/DateTime"
import * as Match from "effect/Match"
import * as Result from "effect/reactivity/AsyncResult"
import { CalendarRange, Info, ListChecks, type LucideIcon } from "lucide-react"
import { startTransition, useOptimistic, type MouseEvent } from "react"
import { flushSync } from "react-dom"

import { MarqueeIfOverflow } from "@/components/ui/marquee-if-overflow"
import {
  SegmentedTabs,
  type SegmentedItem
} from "@/components/ui/segmented-tabs"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  sprintList,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import { SPRINT_STATE_META } from "@/features/sprints/components/SprintChip"
import { boardStatusesFor } from "@/features/sprints/lib/boardUtils"
import { pickSprintNavigationTarget } from "@/features/sprints/lib/sprintTargets"
import {
  countsRequest,
  ticketCounts
} from "@/features/tickets/atoms/ticketCounts"
import { statusMetaFor } from "@/features/tickets/lib/ticketMeta"
import { m } from "@/paraglide/messages"

type TabKey = "tickets" | "sprints" | "about"

type TabDef = {
  key: TabKey
  to:
    | "/orgs/$orgSlug/projects/$slug"
    | "/orgs/$orgSlug/projects/$slug/sprints"
    | "/orgs/$orgSlug/projects/$slug/about"
  label: () => string
  icon: typeof ListChecks
  exact: boolean
  countFor?: "tickets" | "sprints" | "members"
}

const TABS: ReadonlyArray<TabDef> = [
  {
    key: "tickets",
    to: "/orgs/$orgSlug/projects/$slug",
    label: () => m.project_detail_tab_backlog(),
    icon: ListChecks,
    exact: true,
    countFor: "tickets"
  },
  {
    key: "sprints",
    to: "/orgs/$orgSlug/projects/$slug/sprints",
    label: () => m.project_detail_tab_sprints(),
    icon: CalendarRange,
    exact: false,
    countFor: "sprints"
  },
  {
    key: "about",
    to: "/orgs/$orgSlug/projects/$slug/about",
    label: () => m.project_detail_tab_about(),
    icon: Info,
    exact: false
  }
]

export function TabsNav({ project }: { project: ProjectDetailType }) {
  const { orgSlug, slug } = useProjectRoute()
  const pathname = useMatches({
    select: (matches) => matches[matches.length - 1]?.pathname ?? ""
  })
  const base = `/orgs/${orgSlug}/projects/${slug}`
  const countsReq = countsRequest(orgSlug, slug, {})
  const ticketsResult = useAtomValue(ticketCounts(countsReq))
  const ticketsCount = Result.isSuccess(ticketsResult)
    ? ticketsResult.value.total
    : null
  const sprintReq = sprintListRequest(orgSlug, slug)
  const sprintsResult = useAtomValue(sprintList(sprintReq))
  const sprintsCount = Result.isSuccess(sprintsResult)
    ? activeAndPlannedCount(sprintsResult.value)
    : null

  const matchesTab = (key: TabKey): boolean => {
    const t = TABS.find((x) => x.key === key)!
    const target = t.to.replace("$orgSlug", orgSlug).replace("$slug", slug)
    return t.exact
      ? pathname === target ||
          pathname === target + "/" ||
          pathname === base ||
          pathname === base + "/"
      : pathname === target || pathname.startsWith(target + "/")
  }

  const [selectedTab, selectTab] = useOptimistic(
    TABS.find((tab) => matchesTab(tab.key))?.key ?? "tickets"
  )
  const navigate = useNavigate()

  const statusReq = statusesRequest(orgSlug, slug)
  const statusesResult = useAtomValue(statusesFor(statusReq))
  const statuses = Result.isSuccess(statusesResult) ? statusesResult.value : []
  const statusSlugs = boardStatusesFor(statuses)
  const byStatusRaw = Result.isSuccess(ticketsResult)
    ? (ticketsResult.value.byStatus as Record<string, number>)
    : {}
  const ticketBreakdown: Record<string, number> = Object.fromEntries(
    statusSlugs.map((s) => [s, byStatusRaw[s] ?? 0])
  )
  const sprints = Result.isSuccess(sprintsResult) ? sprintsResult.value : []
  const sprintTarget = Result.isSuccess(sprintsResult)
    ? pickSprintNavigationTarget(sprintsResult.value)
    : null
  const items: ReadonlyArray<SegmentedItem<TabKey>> = TABS.map((t) => {
    const destination =
      t.key === "sprints" && sprintTarget
        ? {
            to: "/orgs/$orgSlug/projects/$slug/sprints/$groupId" as const,
            params: { orgSlug, slug, groupId: sprintTarget.id }
          }
        : { to: t.to, params: { orgSlug, slug } }
    const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return
      event.preventDefault()
      startTransition(async () => {
        flushSync(() => selectTab(t.key))
        await navigate({ ...destination, viewTransition: false })
      })
    }
    return {
      key: t.key,
      label: t.label(),
      icon: t.icon,
      badge: Match.value(t.countFor).pipe(
        Match.when("tickets", () => ticketsCount),
        Match.when("sprints", () => sprintsCount),
        Match.when("members", () => project.members.length),
        Match.orElse(() => null)
      ),
      hoverContent: Match.value(t.key).pipe(
        Match.when("tickets", () =>
          ticketsCount === null ? undefined : (
            <MarqueeIfOverflow>
              <TicketsBreakdown counts={ticketBreakdown} statuses={statuses} />
            </MarqueeIfOverflow>
          )
        ),
        Match.when("sprints", () =>
          sprintsCount === null ? undefined : (
            <SprintsBreakdown sprints={sprints} />
          )
        ),
        Match.orElse(() => undefined)
      ),
      render: <Link onClick={onClick} {...destination} />
    }
  })

  return (
    <div className="flex flex-wrap items-center gap-3">
      <SegmentedTabs
        items={items}
        className="project-tabs"
        value={selectedTab}
      />
    </div>
  )
}

function TicketsBreakdown({
  counts,
  statuses
}: {
  counts: Record<string, number>
  statuses: ReadonlyArray<ProjectStatus>
}) {
  const slugs = boardStatusesFor(statuses)
  return (
    <>
      {slugs.map((s) => {
        const meta = statusMetaFor(s, statuses)
        return (
          <BadgeStat
            key={s}
            count={counts[s] ?? 0}
            icon={meta.icon}
            className={meta.className}
            color={meta.color ?? undefined}
          />
        )
      })}
    </>
  )
}

function SprintsBreakdown({ sprints }: { sprints: ReadonlyArray<Group> }) {
  const counts = { active: 0, planned: 0, completed: 0 }
  const now = DateTime.toDate(DateTime.nowUnsafe())
  for (const s of sprints) counts[sprintState(s, now)]++
  const order: ReadonlyArray<keyof typeof counts> = [
    "active",
    "planned",
    "completed"
  ]
  return (
    <>
      {order.map((state) => (
        <BadgeStat
          key={state}
          count={counts[state]}
          icon={SPRINT_STATE_META[state].icon}
          className={SPRINT_STATE_META[state].className}
        />
      ))}
    </>
  )
}

function BadgeStat({
  count,
  icon: Icon,
  className,
  color
}: {
  count: number
  icon: LucideIcon
  className: string
  color?: string
}) {
  return (
    <span className="inline-flex items-center gap-0.5 font-mono text-[10px] font-medium text-foreground tabular-nums">
      <Icon
        className={`size-3 ${className}`}
        style={color ? { color } : undefined}
        strokeWidth={1.75}
      />
      {count}
    </span>
  )
}
