import { useAtomValue } from "@effect/atom-react"
import {
  activeAndPlannedCount,
  pickActiveSprint,
  pickEarliestPlannedSprint,
  sprintState
} from "@pp/shared"
import type {
  Group,
  ProjectDetail as ProjectDetailType,
  ProjectStatus
} from "@pp/shared"
import {
  createFileRoute,
  Link,
  Outlet,
  useMatches,
  useNavigate
} from "@tanstack/react-router"
import * as DateTime from "effect/DateTime"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import {
  CalendarRange,
  Columns3,
  FileText,
  Info,
  ListChecks,
  Rows3,
  type LucideIcon
} from "lucide-react"
import {
  startTransition,
  useOptimistic,
  type MouseEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react"
import { flushSync } from "react-dom"

import { PageContainer } from "@/components/page"
import { ProjectHeader } from "@/components/ProjectHeader"
import {
  SEGMENTED_ITEM_CLASS,
  SegmentedTabs,
  type SegmentedItem
} from "@/components/SegmentedTabs"
import { boardStatusesFor } from "@/components/sprints/board-utils"
import { SPRINT_STATE_META } from "@/components/sprints/SprintChip"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import {
  sprintList,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import {
  countsRequest,
  ticketCounts
} from "@/features/tickets/atoms/ticketCounts"
import { useProjectView } from "@/hooks/useViewPreference"
import { statusMetaFor } from "@/lib/ticket-meta"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { useProject } from "../-context"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/_projectHeader"
)({
  component: ProjectHeaderLayout
})

function ProjectHeaderLayout() {
  const { orgSlug, slug } = Route.useParams()
  const project = useProject()

  return (
    <>
      <PageContainer className="gap-3">
        <ProjectHeader
          orgSlug={orgSlug}
          slug={project.slug}
          name={project.name}
          project={project}
        />
        <TabsNav orgSlug={orgSlug} slug={slug} project={project} />
      </PageContainer>
      <Outlet />
    </>
  )
}

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

function TabsNav({
  orgSlug,
  slug,
  project
}: {
  orgSlug: string
  slug: string
  project: ProjectDetailType
}) {
  const pathname = useMatches({
    select: (matches) => matches[matches.length - 1]?.pathname ?? ""
  })
  const base = `/orgs/${orgSlug}/projects/${slug}`
  const countsReq = useMemo(
    () => countsRequest(orgSlug, slug, {}),
    [orgSlug, slug]
  )
  const ticketsResult = useAtomValue(ticketCounts(countsReq))
  const ticketsCount = Result.isSuccess(ticketsResult)
    ? ticketsResult.value.total
    : null
  const sprintReq = useMemo(
    () => sprintListRequest(orgSlug, slug),
    [orgSlug, slug]
  )
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
  const isActive = (key: TabKey) => selectedTab === key

  const statusReq = useMemo(
    () => statusesRequest(orgSlug, slug),
    [orgSlug, slug]
  )
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
  const items: ReadonlyArray<SegmentedItem<TabKey>> = TABS.map((t) => ({
    key: t.key,
    label: t.label(),
    icon: t.icon,
    badge:
      t.countFor === "tickets"
        ? ticketsCount
        : t.countFor === "sprints"
          ? sprintsCount
          : t.countFor === "members"
            ? project.members.length
            : null
  }))

  return (
    <div className="flex flex-wrap items-center gap-3">
      <SegmentedTabs
        items={items}
        className="project-tabs"
        isActive={isActive}
        renderItem={(item, content, { active }) => {
          const def = TABS.find((t) => t.key === item.key)!
          const destination =
            item.key === "sprints" && sprintTarget
              ? {
                  to: "/orgs/$orgSlug/projects/$slug/sprints/$groupId" as const,
                  params: { orgSlug, slug, groupId: sprintTarget.id }
                }
              : { to: def.to, params: { orgSlug, slug } }
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
              flushSync(() => selectTab(item.key))
              await navigate({ ...destination, viewTransition: false })
            })
          }

          if (item.key === "tickets" && ticketsCount !== null) {
            return (
              <Link
                onClick={onClick}
                {...destination}
                className={SEGMENTED_ITEM_CLASS(active)}
              >
                <span className="relative z-10 inline-flex items-center gap-1.5 transition-opacity group-hover/seg-item:opacity-0 group-hover/seg-item:duration-0">
                  <ListChecks className="size-3.5" strokeWidth={1.75} />
                  <span>{m.project_detail_tab_backlog()}</span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 font-mono text-[10px] tabular-nums",
                      active
                        ? "bg-foreground/10 text-foreground"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {ticketsCount}
                  </span>
                </span>
                <span className="pointer-events-none absolute inset-0 z-10 opacity-0 transition-opacity group-hover/seg-item:opacity-100 group-hover/seg-item:duration-0">
                  <MarqueeIfOverflow>
                    <TicketsBreakdown
                      counts={ticketBreakdown}
                      statuses={statuses}
                    />
                  </MarqueeIfOverflow>
                </span>
              </Link>
            )
          }
          if (item.key === "sprints" && sprintsCount !== null) {
            const children = (
              <>
                <span className="relative z-10 inline-flex items-center gap-1.5 transition-opacity group-hover/seg-item:opacity-0 group-hover/seg-item:duration-0">
                  <CalendarRange className="size-3.5" strokeWidth={1.75} />
                  <span>{m.project_detail_tab_sprints()}</span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 font-mono text-[10px] tabular-nums",
                      active
                        ? "bg-foreground/10 text-foreground"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {sprintsCount}
                  </span>
                </span>
                <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 whitespace-nowrap opacity-0 transition-opacity group-hover/seg-item:opacity-100 group-hover/seg-item:duration-0">
                  <SprintsBreakdown sprints={sprints} />
                </span>
              </>
            )
            return (
              <Link
                onClick={onClick}
                {...destination}
                className={SEGMENTED_ITEM_CLASS(active)}
              >
                {children}
              </Link>
            )
          }
          return (
            <Link
              onClick={onClick}
              {...destination}
              className={SEGMENTED_ITEM_CLASS(active)}
            >
              {content}
            </Link>
          )
        }}
      />
      <ViewSwitcher orgSlug={orgSlug} slug={slug} />
    </div>
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

function ViewSwitcher({ orgSlug, slug }: { orgSlug: string; slug: string }) {
  const navigate = useNavigate()
  const matches = useMatches()
  const sprintMatch = matches.find(
    (m) =>
      m.routeId ===
      "/_authed/orgs/$orgSlug/projects/$slug/_projectHeader/sprints/$groupId"
  )
  const backlogMatch = matches.find(
    (m) => m.routeId === "/_authed/orgs/$orgSlug/projects/$slug/_projectHeader/"
  )
  const search = (sprintMatch ?? backlogMatch)?.search as
    | { view?: "list" | "board" | "description" }
    | undefined
  const { view, setPreference } = useProjectView(orgSlug, slug, search?.view)
  if (!sprintMatch && !backlogMatch) return null

  const select = (next: "list" | "board" | "description", to: () => void) => {
    if (next !== "description") flushSync(() => setPreference(next))
    startTransition(to)
  }

  if (sprintMatch) {
    const { groupId } = sprintMatch.params as { groupId: string }
    return (
      <SwitcherTabs
        ariaLabel={m.sprints_view_tabs_aria_label()}
        current={view}
        items={[
          { key: "list", label: m.sprints_view_list(), icon: Rows3 },
          { key: "board", label: m.sprints_view_board(), icon: Columns3 },
          {
            key: "description",
            label: m.sprints_view_description(),
            icon: FileText
          }
        ]}
        onSelect={(next) =>
          select(next, () => {
            void navigate({
              to: "/orgs/$orgSlug/projects/$slug/sprints/$groupId",
              params: { orgSlug, slug, groupId },
              search: (prev) => ({
                ...prev,
                updatedAfter: prev.updatedAfter?.toISOString(),
                view: next
              })
            })
          })
        }
      />
    )
  }

  return (
    <SwitcherTabs
      ariaLabel={m.tickets_view_tabs_aria_label()}
      current={view === "description" ? "list" : view}
      items={[
        { key: "list", label: m.tickets_view_list(), icon: Rows3 },
        { key: "board", label: m.tickets_view_board(), icon: Columns3 }
      ]}
      onSelect={(next) =>
        select(next, () => {
          void navigate({
            to: "/orgs/$orgSlug/projects/$slug",
            params: { orgSlug, slug },
            search: (prev) => ({
              ...prev,
              updatedAfter: prev.updatedAfter?.toISOString(),
              view: next
            })
          })
        })
      }
    />
  )
}

function SwitcherTabs<K extends string>({
  ariaLabel,
  current,
  items,
  onSelect
}: {
  ariaLabel: string
  current: K
  items: ReadonlyArray<SegmentedItem<K>>
  onSelect: (next: K) => void
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="ml-auto">
      <SegmentedTabs
        items={items}
        isActive={(k) => k === current}
        renderItem={(item, content, { active }) => (
          <button
            type="button"
            onClick={() => {
              if (item.key !== current) onSelect(item.key)
            }}
            aria-pressed={active}
            className={SEGMENTED_ITEM_CLASS(active)}
          >
            {content}
          </button>
        )}
      />
    </div>
  )
}

function MarqueeIfOverflow({
  children,
  speedPxPerSec = 35
}: {
  children: ReactNode
  speedPxPerSec?: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<{ overflow: boolean; duration: number }>({
    overflow: false,
    duration: 20
  })

  useLayoutEffect(() => {
    const container = containerRef.current
    const measure = measureRef.current
    if (!container || !measure) return
    const update = () => {
      const cw = container.clientWidth
      const iw = measure.scrollWidth
      if (cw === 0 || iw === 0) return
      const overflow = iw > cw
      const duration = Math.max(8, iw / speedPxPerSec)
      setState((prev) =>
        prev.overflow === overflow && Math.abs(prev.duration - duration) < 0.5
          ? prev
          : { overflow, duration }
      )
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(container)
    ro.observe(measure)
    return () => ro.disconnect()
  }, [speedPxPerSec, children])

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex h-full w-full items-center overflow-hidden",
        state.overflow &&
          "[mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]"
      )}
    >
      {state.overflow ? (
        <div
          className="animate-marquee-x flex w-max items-center [animation-play-state:paused] group-hover/seg-item:[animation-play-state:running]"
          style={{ animationDuration: `${state.duration}s` }}
        >
          <div
            ref={measureRef}
            className="flex shrink-0 items-center gap-2 pr-2"
          >
            {children}
          </div>
          <div aria-hidden className="flex shrink-0 items-center gap-2 pr-2">
            {children}
          </div>
        </div>
      ) : (
        <div
          ref={measureRef}
          className="flex w-full items-center justify-center gap-2 whitespace-nowrap"
        >
          {children}
        </div>
      )}
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
