import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import {
  createFileRoute,
  Link,
  Outlet,
  useLocation,
  useMatches,
  useNavigate
} from "@tanstack/react-router"
import * as DateTime from "effect/DateTime"
import { useCallback, useEffect, useState, type KeyboardEvent } from "react"
import {
  CalendarRange,
  Columns3,
  GitBranch,
  Info,
  ListChecks,
  MoreHorizontal,
  Rows3,
  SlidersHorizontal,
  UserPlus,
  Workflow,
  X,
  type LucideIcon
} from "lucide-react"
import { STATUS_META } from "@/lib/ticket-meta"
import { useProjectRole } from "@/lib/projectRole"
import {
  projectAtom,
  projectKey,
  updateProjectSetupAtom,
  updateProjectAtom
} from "@/atoms/projects"
import { ticketsCountAtom, ticketsCountKey } from "@/atoms/tickets"
import {
  projectKey as sprintsProjectKey,
  sprintsListAtom
} from "@/atoms/sprints"
import { projectGitStatesAtom } from "@/atoms/github"
import {
  activeAndPlannedCount,
  pickActiveSprint,
  pickEarliestPlannedSprint,
  sprintState
} from "@projectproject/shared"
import { ActiveSprintLine } from "@/components/sprints/ActiveSprintLine"
import { SPRINT_STATE_META } from "@/components/sprints/SprintChip"
import { motion } from "motion/react"
import { GithubChip } from "@/components/GithubChip"
import { ProjectIdentityEditor } from "@/components/ProjectIdentityEditor"
import { useSidebarSection } from "@/components/SidebarSlot"
import { cn } from "@/lib/utils"
import { springs } from "@/lib/springs"
import {
  SEGMENTED_ITEM_CLASS,
  SegmentedTabs,
  type SegmentedItem
} from "@/components/SegmentedTabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { ErrorPage } from "@/components/ErrorPage"
import { NotFoundPage } from "@/components/NotFoundPage"
import { PageContainer } from "@/components/page"
import { m } from "@/paraglide/messages"
import { TagRenamesProvider } from "@/components/TagRenamesProvider"
import { ProjectContext } from "./-context"
import type {
  Group,
  ProjectDetail as ProjectDetailType,
  TicketStatus
} from "@projectproject/shared"

export const Route = createFileRoute("/_authed/orgs/$orgSlug/projects/$slug")({
  component: ProjectLayout,
  loader: ({ params }) => ({
    crumb: [
      {
        type: "static" as const,
        label: m.chrome_sidebar_projects(),
        to: "/orgs/$orgSlug/projects",
        params: { orgSlug: params.orgSlug }
      },
      {
        type: "project" as const,
        orgSlug: params.orgSlug,
        slug: params.slug
      }
    ]
  })
})

function useIsSprintBoardView() {
  const matches = useMatches()
  const sprintMatch = matches.find(
    (m) =>
      m.routeId === "/_authed/orgs/$orgSlug/projects/$slug/sprints/$groupId"
  )
  if (!sprintMatch) return false
  const search = sprintMatch.search as { view?: "list" | "board" }
  return (search.view ?? "board") === "board"
}

function ProjectLayout() {
  const { orgSlug, slug } = Route.useParams()
  const wide = useIsSprintBoardView()
  const location = useLocation()
  const project = useAtomValue(projectAtom(projectKey(orgSlug, slug)))
  const onTicketDetail = location.pathname.startsWith(
    `/orgs/${orgSlug}/projects/${slug}/tickets/`
  )
  const onReview = location.pathname.startsWith(
    `/orgs/${orgSlug}/projects/${slug}/reviews/`
  )
  const onSettings = location.pathname.startsWith(
    `/orgs/${orgSlug}/projects/${slug}/settings`
  )

  return Result.matchWithError(project, {
    onInitial: () => (
      <PageContainer wide={wide}>
        <Skeleton />
      </PageContainer>
    ),
    onError: (error) =>
      error._tag === "NotFound" ? (
        <NotFoundPage
          contained
          title={m.project_detail_not_found_title()}
          body={m.project_detail_not_found_body({ slug })}
        />
      ) : (
        <ErrorPage
          contained
          error={error}
          title={m.project_detail_load_error_title()}
          body={m.project_detail_load_error_body()}
        />
      ),
    onDefect: (defect) => (
      <ErrorPage
        contained
        error={defect}
        title={m.project_detail_load_error_title()}
        body={m.project_detail_load_error_body()}
      />
    ),
    onSuccess: ({ value }) => (
      <ProjectContext.Provider value={value}>
        <TagRenamesProvider>
          <ProjectSetupSlot orgSlug={orgSlug} slug={slug} project={value} />
          <div className="flex flex-1 flex-col gap-6">
            {!onTicketDetail && !onReview && !onSettings && (
              <PageContainer wide={wide}>
                <ProjectHeader
                  orgSlug={orgSlug}
                  slug={value.slug}
                  name={value.name}
                  project={value}
                />
                <TabsNav orgSlug={orgSlug} slug={slug} project={value} />
              </PageContainer>
            )}
            <Outlet />
          </div>
        </TagRenamesProvider>
      </ProjectContext.Provider>
    )
  })
}

function ProjectHeader({
  orgSlug,
  slug,
  name,
  project
}: {
  orgSlug: string
  slug: string
  name: string
  project: ProjectDetailType
}) {
  const { role: myRole } = useProjectRole()
  const canEdit = myRole === "owner" || myRole === "admin"

  return (
    <header className="flex items-start gap-3">
      <ProjectIdentityEditor
        orgSlug={orgSlug}
        slug={slug}
        icon={project.icon}
        color={project.color}
        canEdit={canEdit}
        size="header"
      />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <NameField orgSlug={orgSlug} slug={slug} name={name} />
        <ActiveSprintLine orgSlug={orgSlug} slug={slug} />
      </div>
      <div className="flex items-center gap-3">
        <GithubChip
          orgSlug={orgSlug}
          slug={slug}
          github={project.github}
          callerRole={myRole}
        />
        <ProjectMenu orgSlug={orgSlug} slug={slug} />
      </div>
    </header>
  )
}

function NameField({
  orgSlug,
  slug,
  name
}: {
  orgSlug: string
  slug: string
  name: string
}) {
  const pKey = projectKey(orgSlug, slug)
  const update = useAtomSet(updateProjectAtom(pKey), { mode: "promiseExit" })
  const updateState = useAtomValue(updateProjectAtom(pKey))
  const saving = updateState.waiting
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)

  useEffect(() => {
    if (!editing) setDraft(name)
  }, [editing, name])

  async function commit() {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === name) {
      setEditing(false)
      setDraft(name)
      return
    }
    await update({ name: trimmed })
    setEditing(false)
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      void commit()
    } else if (e.key === "Escape") {
      e.preventDefault()
      setDraft(name)
      setEditing(false)
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="-mx-1 truncate rounded px-1 text-left text-2xl font-semibold tracking-tight hover:bg-accent/40"
      >
        {name}
      </button>
    )
  }
  return (
    <input
      autoFocus
      value={draft}
      disabled={saving}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={handleKey}
      className="-mx-1 w-full rounded bg-transparent px-1 text-2xl font-semibold tracking-tight outline-none ring-2 ring-ring/50"
      maxLength={120}
      aria-label={m.project_detail_name_aria_label()}
    />
  )
}

function ProjectSetupSlot({
  orgSlug,
  slug,
  project
}: {
  orgSlug: string
  slug: string
  project: ProjectDetailType
}) {
  const { role } = useProjectRole()
  const canManage = role === "owner" || role === "admin"
  const render = useCallback(
    () => (
      <ProjectSetupRail
        orgSlug={orgSlug}
        slug={slug}
        project={project}
        canManage={canManage}
      />
    ),
    [orgSlug, slug, project, canManage]
  )
  useSidebarSection(`project-setup:${orgSlug}/${slug}`, render)
  return null
}

function ProjectSetupRail({
  orgSlug,
  slug,
  project,
  canManage
}: {
  orgSlug: string
  slug: string
  project: ProjectDetailType
  canManage: boolean
}) {
  const key = projectKey(orgSlug, slug)
  const gitStates = useAtomValue(projectGitStatesAtom(key))
  const updateSetup = useAtomSet(updateProjectSetupAtom(key))
  if (!canManage) return null

  const brokenGithub =
    Result.isSuccess(gitStates) &&
    (gitStates.value.tokenStatus !== "ok" ||
      gitStates.value.repoStatus === "gone")
  const items = [
    !project.setup.workflowReviewedAt
      ? {
          key: "workflow",
          to: "/orgs/$orgSlug/projects/$slug/settings/workflow" as const,
          label: m.project_setup_review_workflow(),
          icon: Workflow,
          dismiss: null
        }
      : null,
    project.members.length < 2 && !project.setup.invitePeopleDismissedAt
      ? {
          key: "invite",
          to: "/orgs/$orgSlug/projects/$slug/settings/team" as const,
          label: m.project_setup_invite_people(),
          icon: UserPlus,
          dismiss: () =>
            updateSetup({
              invitePeopleDismissedAt: DateTime.toDate(DateTime.unsafeNow())
            })
        }
      : null,
    brokenGithub || (!project.github && !project.setup.connectGithubDismissedAt)
      ? {
          key: "github",
          to: "/orgs/$orgSlug/projects/$slug/settings/integrations" as const,
          label: m.project_setup_connect_github(),
          icon: GitBranch,
          dismiss: project.github
            ? null
            : () =>
                updateSetup({
                  connectGithubDismissedAt: DateTime.toDate(
                    DateTime.unsafeNow()
                  )
                })
        }
      : null
  ].filter((item) => item !== null)

  if (items.length === 0) return null

  return (
    <div className="flex flex-col gap-1 px-3 pt-6">
      <div className="px-3 pb-1 text-xs font-medium text-muted-foreground">
        {m.project_setup_section_label()}
      </div>
      <nav className="flex flex-col gap-1">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <div key={item.key} className="group/setup-row relative">
              <Link
                to={item.to}
                params={{ orgSlug, slug }}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 pr-8 text-[13px] text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
              >
                <Icon className="size-4" strokeWidth={1.75} />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </Link>
              {item.dismiss ? (
                <button
                  type="button"
                  aria-label={m.project_setup_dismiss_aria_label({
                    item: item.label
                  })}
                  onClick={item.dismiss}
                  className="absolute right-1.5 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground opacity-0 transition-colors transition-transform duration-100 hover:bg-background hover:text-foreground group-hover/setup-row:opacity-100 active:scale-[0.97]"
                >
                  <X className="size-3.5" strokeWidth={1.75} />
                </button>
              ) : null}
            </div>
          )
        })}
      </nav>
    </div>
  )
}

function ProjectMenu({ orgSlug, slug }: { orgSlug: string; slug: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={m.project_detail_actions_aria_label()}
            className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition-colors transition-transform duration-100 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]"
          >
            <MoreHorizontal className="size-4" strokeWidth={1.75} />
          </button>
        }
      />
      <DropdownMenuContent align="end" sideOffset={6} className="w-44">
        <DropdownMenuItem
          render={
            <Link
              to="/orgs/$orgSlug/projects/$slug/settings"
              params={{ orgSlug, slug }}
            />
          }
        >
          <SlidersHorizontal className="size-4" strokeWidth={1.75} />
          {m.project_detail_tab_settings()}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
  const location = useLocation()
  const base = `/orgs/${orgSlug}/projects/${slug}`
  const ticketsResult = useAtomValue(
    ticketsCountAtom(ticketsCountKey(orgSlug, slug, {}))
  )
  const ticketsCount = Result.isSuccess(ticketsResult)
    ? ticketsResult.value.total
    : null
  const sprintsResult = useAtomValue(
    sprintsListAtom(sprintsProjectKey(orgSlug, slug))
  )
  const sprintsCount = Result.isSuccess(sprintsResult)
    ? activeAndPlannedCount(sprintsResult.value)
    : null

  const isActive = (key: TabKey): boolean => {
    const t = TABS.find((x) => x.key === key)!
    const target = t.to.replace("$orgSlug", orgSlug).replace("$slug", slug)
    return t.exact
      ? location.pathname === target ||
          location.pathname === target + "/" ||
          location.pathname === base ||
          location.pathname === base + "/"
      : location.pathname === target ||
          location.pathname.startsWith(target + "/")
  }

  const ticketBreakdown: Record<TicketStatus, number> = Result.isSuccess(
    ticketsResult
  )
    ? {
        todo: ticketsResult.value.byStatus.todo ?? 0,
        in_progress: ticketsResult.value.byStatus.in_progress ?? 0,
        done: ticketsResult.value.byStatus.done ?? 0
      }
    : { todo: 0, in_progress: 0, done: 0 }
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
        layoutId={`project-tabs-${slug}`}
        isActive={isActive}
        renderItem={(item, content, { active }) => {
          const def = TABS.find((t) => t.key === item.key)!
          if (item.key === "tickets" && ticketsCount !== null) {
            return (
              <Link
                to={def.to}
                params={{ orgSlug, slug }}
                className={SEGMENTED_ITEM_CLASS(active)}
              >
                {active && (
                  <motion.span
                    layoutId={`project-tabs-${slug}-active`}
                    transition={springs.moderate}
                    className="absolute inset-0 z-0 rounded-lg bg-accent"
                  />
                )}
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
                <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 whitespace-nowrap opacity-0 transition-opacity group-hover/seg-item:opacity-100 group-hover/seg-item:duration-0">
                  <TicketsBreakdown counts={ticketBreakdown} />
                </span>
              </Link>
            )
          }
          if (item.key === "sprints" && sprintsCount !== null) {
            const children = (
              <>
                {active && (
                  <motion.span
                    layoutId={`project-tabs-${slug}-active`}
                    transition={springs.moderate}
                    className="absolute inset-0 z-0 rounded-lg bg-accent"
                  />
                )}
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
            if (sprintTarget) {
              return (
                <Link
                  to="/orgs/$orgSlug/projects/$slug/sprints/$groupId"
                  params={{ orgSlug, slug, groupId: sprintTarget.id }}
                  className={SEGMENTED_ITEM_CLASS(active)}
                >
                  {children}
                </Link>
              )
            }
            return (
              <Link
                to={def.to}
                params={{ orgSlug, slug }}
                className={SEGMENTED_ITEM_CLASS(active)}
              >
                {children}
              </Link>
            )
          }
          return (
            <Link
              to={def.to}
              params={{ orgSlug, slug }}
              className={SEGMENTED_ITEM_CLASS(active)}
            >
              {content}
            </Link>
          )
        }}
      />
      <SprintViewSwitcher orgSlug={orgSlug} slug={slug} />
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

function SprintViewSwitcher({
  orgSlug,
  slug
}: {
  orgSlug: string
  slug: string
}) {
  const navigate = useNavigate()
  const matches = useMatches()
  const sprintMatch = matches.find(
    (m) =>
      m.routeId === "/_authed/orgs/$orgSlug/projects/$slug/sprints/$groupId"
  )
  if (!sprintMatch) return null
  const search = sprintMatch.search as { view?: "list" | "board" }
  const view: "list" | "board" = search.view ?? "board"
  const { groupId } = sprintMatch.params as { groupId: string }
  const setView = (next: "list" | "board") => {
    if (next === view) return
    void navigate({
      to: "/orgs/$orgSlug/projects/$slug/sprints/$groupId",
      params: { orgSlug, slug, groupId },
      search: (prev) => ({ ...prev, view: next })
    })
  }
  const items: ReadonlyArray<SegmentedItem<"list" | "board">> = [
    { key: "list", label: m.sprints_view_list(), icon: Rows3 },
    { key: "board", label: m.sprints_view_board(), icon: Columns3 }
  ]
  return (
    <div
      role="group"
      aria-label={m.sprints_view_tabs_aria_label()}
      className="ml-auto"
    >
      <SegmentedTabs
        items={items}
        layoutId={`sprint-view-${groupId}`}
        isActive={(k) => k === view}
        renderItem={(item, content, { active }) => (
          <button
            type="button"
            onClick={() => setView(item.key)}
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

function TicketsBreakdown({
  counts
}: {
  counts: Record<TicketStatus, number>
}) {
  return (
    <>
      {(Object.keys(STATUS_META) as Array<keyof typeof STATUS_META>).map(
        (s) => (
          <BadgeStat
            key={s}
            count={counts[s]}
            icon={STATUS_META[s].icon}
            className={STATUS_META[s].className}
          />
        )
      )}
    </>
  )
}

function SprintsBreakdown({ sprints }: { sprints: ReadonlyArray<Group> }) {
  const counts = { active: 0, planned: 0, completed: 0 }
  const now = DateTime.toDate(DateTime.unsafeNow())
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
  className
}: {
  count: number
  icon: LucideIcon
  className: string
}) {
  return (
    <span className="inline-flex items-center gap-0.5 font-mono text-[10px] font-medium tabular-nums text-foreground">
      <Icon className={`size-3 ${className}`} strokeWidth={1.75} />
      {count}
    </span>
  )
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-12 skeleton rounded-lg bg-muted/60" />
      <div className="h-9 skeleton rounded-lg bg-muted/60" />
      <div className="h-40 skeleton rounded-xl bg-muted/60" />
    </div>
  )
}
