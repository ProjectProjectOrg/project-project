import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import {
  createFileRoute,
  Link,
  Outlet,
  useLocation,
  useNavigate
} from "@tanstack/react-router"
import { Exit } from "effect"
import { useEffect, useState, type KeyboardEvent } from "react"
import {
  CalendarRange,
  FolderKanban,
  Info,
  ListChecks,
  MoreHorizontal,
  Trash2,
  Users as UsersIcon,
  type LucideIcon
} from "lucide-react"
import { STATUS_META } from "@/lib/ticket-meta"
import { useProjectRole } from "@/lib/projectRole"
import {
  deleteProjectAtom,
  projectAtom,
  projectKey,
  updateProjectAtom
} from "@/atoms/projects"
import { ticketsListAtom, ticketsListKey } from "@/atoms/tickets"
import {
  projectKey as sprintsProjectKey,
  sprintsListAtom
} from "@/atoms/sprints"
import { activeAndPlannedCount, sprintState } from "@projectproject/shared"
import { ActiveSprintLine } from "@/components/sprints/ActiveSprintLine"
import { SPRINT_STATE_META } from "@/components/sprints/SprintChip"
import { motion } from "motion/react"
import { GithubChip } from "@/components/GithubChip"
import { cn } from "@/lib/utils"
import { springs } from "@/lib/springs"
import {
  SEGMENTED_ITEM_CLASS,
  SegmentedTabs,
  type SegmentedItem
} from "@/components/SegmentedTabs"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { PageContainer } from "@/components/page"
import { m } from "@/paraglide/messages"
import { TagRenamesProvider } from "@/components/TagRenamesProvider"
import { ProjectContext } from "./-context"
import type {
  Group,
  Ticket,
  ProjectDetail as ProjectDetailType
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

function ProjectLayout() {
  const { orgSlug, slug } = Route.useParams()
  const project = useAtomValue(projectAtom(projectKey(orgSlug, slug)))

  return (
    <PageContainer>
      {Result.matchWithError(project, {
        onInitial: () => <Skeleton />,
        onError: (error) =>
          error._tag === "NotFound" ? (
            <NotFoundCard slug={slug} />
          ) : (
            <ErrorCard
              message={m.project_detail_load_error({ tag: error._tag })}
            />
          ),
        onDefect: (defect) => (
          <ErrorCard message={m.chrome_defect({ defect: String(defect) })} />
        ),
        onSuccess: ({ value }) => (
          <ProjectContext.Provider value={value}>
            <TagRenamesProvider>
              <ProjectHeader
                orgSlug={orgSlug}
                slug={value.slug}
                name={value.name}
                project={value}
              />
              <TabsNav orgSlug={orgSlug} slug={slug} project={value} />
              <Outlet />
            </TagRenamesProvider>
          </ProjectContext.Provider>
        )
      })}
    </PageContainer>
  )
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

  return (
    <header className="flex items-start gap-3">
      <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        <FolderKanban className="size-5" strokeWidth={1.75} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <NameField orgSlug={orgSlug} slug={slug} name={name} />
        <ActiveSprintLine orgSlug={orgSlug} slug={slug} />
      </div>
      <GithubChip
        orgSlug={orgSlug}
        slug={slug}
        github={project.github}
        callerRole={myRole}
      />
      <ProjectMenu orgSlug={orgSlug} slug={slug} />
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

function ProjectMenu({ orgSlug, slug }: { orgSlug: string; slug: string }) {
  const pKey = projectKey(orgSlug, slug)
  const remove = useAtomSet(deleteProjectAtom(pKey), { mode: "promiseExit" })
  const removeState = useAtomValue(deleteProjectAtom(pKey))
  const deleting = removeState.waiting
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)

  async function onDelete() {
    const exit = await remove()
    if (Exit.isSuccess(exit)) {
      navigate({ to: "/orgs/$orgSlug/projects", params: { orgSlug } })
    }
  }

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) setConfirming(false)
      }}
    >
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={m.project_detail_actions_aria_label()}
            className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring outline-none"
          >
            <MoreHorizontal className="size-4" strokeWidth={1.75} />
          </button>
        }
      />
      <DropdownMenuContent align="end" sideOffset={6} className="w-56">
        {!confirming ? (
          <DropdownMenuItem
            closeOnClick={false}
            onClick={() => setConfirming(true)}
            className="cursor-pointer text-destructive focus:text-destructive"
          >
            <Trash2 className="size-4" strokeWidth={1.75} />
            {m.project_detail_delete_button()}
          </DropdownMenuItem>
        ) : (
          <div className="flex flex-col gap-2 p-1">
            <p className="px-2 pt-1 text-xs text-muted-foreground">
              {m.project_detail_delete_confirm_prompt()}
            </p>
            <div className="flex gap-1 px-1 pb-1">
              <button
                type="button"
                disabled={deleting}
                onClick={() => void onDelete()}
                className="flex-1 rounded-md bg-destructive px-2 py-1 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
              >
                {deleting
                  ? m.project_detail_delete_in_progress()
                  : m.project_detail_delete_confirm_button()}
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => setConfirming(false)}
                className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {m.common_cancel_button()}
              </button>
            </div>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type TabKey = "tickets" | "sprints" | "about" | "members"
type TabDef = {
  key: TabKey
  to:
    | "/orgs/$orgSlug/projects/$slug"
    | "/orgs/$orgSlug/projects/$slug/sprints"
    | "/orgs/$orgSlug/projects/$slug/about"
    | "/orgs/$orgSlug/projects/$slug/members"
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
  },
  {
    key: "members",
    to: "/orgs/$orgSlug/projects/$slug/members",
    label: () => m.project_detail_tab_members(),
    icon: UsersIcon,
    exact: false,
    countFor: "members"
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
    ticketsListAtom(ticketsListKey(orgSlug, slug))
  )
  const ticketsCount = Result.isSuccess(ticketsResult)
    ? ticketsResult.value.length
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

  const tickets = Result.isSuccess(ticketsResult) ? ticketsResult.value : []
  const sprints = Result.isSuccess(sprintsResult) ? sprintsResult.value : []
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
                    className="absolute inset-0 -z-0 rounded-lg bg-accent"
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
                  <TicketsBreakdown tickets={tickets} />
                </span>
              </Link>
            )
          }
          if (item.key === "sprints" && sprintsCount !== null) {
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
                    className="absolute inset-0 -z-0 rounded-lg bg-accent"
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

    </div>
  )
}

function TicketsBreakdown({ tickets }: { tickets: ReadonlyArray<Ticket> }) {
  const counts = { todo: 0, in_progress: 0, done: 0 }
  for (const t of tickets) counts[t.status]++
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
  const now = new Date()
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

function NotFoundCard({ slug }: { slug: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.project_detail_not_found_title()}</CardTitle>
        <CardDescription>
          {m.project_detail_not_found_prefix()}{" "}
          <span className="font-mono">/{slug}</span>
          {m.project_detail_not_found_suffix()}
        </CardDescription>
      </CardHeader>
    </Card>
  )
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{m.project_detail_load_error_title()}</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
    </Card>
  )
}
