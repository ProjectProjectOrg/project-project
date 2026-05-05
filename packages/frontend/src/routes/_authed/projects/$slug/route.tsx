// Project layout. Owns the header (name, slug, project menu) and the tab
// strip; the active sub-route renders inside <Outlet />.
//
// Why a layout, not one big page:
//   - tickets are the main view; description/members are secondary
//   - each sub-view gets a real URL (deep-linkable, breadcrumb-able)
//   - the project atom loads once for all sub-views (no waterfall)

import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import {
  createFileRoute,
  Link,
  Outlet,
  useLocation,
  useNavigate
} from "@tanstack/react-router"
import { useEffect, useState, type KeyboardEvent } from "react"
import {
  Check,
  CircleDashed,
  CircleDot,
  FolderKanban,
  Info,
  ListChecks,
  MoreHorizontal,
  Trash2,
  Users as UsersIcon
} from "lucide-react"
import { meAtom } from "@/atoms/auth"
import {
  deleteProjectAtom,
  projectAtom,
  updateProjectAtom
} from "@/atoms/projects"
import { ticketsListAtom } from "@/atoms/tickets"
import { GithubChip } from "@/components/GithubChip"
import type { Role } from "@projectproject/shared"
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
import { ProjectContext } from "./-context"
import type {
  Ticket,
  ProjectDetail as ProjectDetailType
} from "@projectproject/shared"

export const Route = createFileRoute("/_authed/projects/$slug")({
  component: ProjectLayout,
  loader: ({ params }) => ({
    crumb: [
      { type: "static" as const, label: "Projects", to: "/projects" },
      { type: "project" as const, slug: params.slug }
    ]
  })
})

function ProjectLayout() {
  const { slug } = Route.useParams()
  const project = useAtomValue(projectAtom(slug))

  return (
    <PageContainer>
      {Result.matchWithError(project, {
        onInitial: () => <Skeleton />,
        onError: (error) =>
          error._tag === "NotFound" ? (
            <NotFoundCard slug={slug} />
          ) : (
            <ErrorCard message={`Couldn't load project: ${error._tag}`} />
          ),
        onDefect: (defect) => (
          <ErrorCard message={`Something went wrong: ${String(defect)}`} />
        ),
        onSuccess: ({ value }) => (
          <ProjectContext.Provider value={value}>
            <ProjectHeader
              slug={value.slug}
              name={value.name}
              project={value}
            />
            <TabsNav slug={slug} project={value} />
            <Outlet />
          </ProjectContext.Provider>
        )
      })}
    </PageContainer>
  )
}

function ProjectHeader({
  slug,
  name,
  project
}: {
  slug: string
  name: string
  project: ProjectDetailType
}) {
  // Caller's role on this project — drives whether the GitHub chip shows the
  // "connect" affordance and the manage panel. `member` is the safe default
  // if we somehow can't resolve `me` (the page wouldn't have rendered if
  // membership were missing).
  const me = useAtomValue(meAtom)
  const myRole: Role = Result.isSuccess(me)
    ? (project.members.find((m) => m.id === me.value.id)?.role ?? "member")
    : "member"

  return (
    <header className="flex items-start gap-3">
      <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        <FolderKanban className="size-5" strokeWidth={1.75} />
      </div>
      <div className="min-w-0 flex-1">
        <NameField slug={slug} name={name} />
        <p className="font-mono text-xs text-muted-foreground">/{slug}</p>
      </div>
      <GithubChip slug={slug} github={project.github} callerRole={myRole} />
      <ProjectMenu slug={slug} />
    </header>
  )
}

function NameField({ slug, name }: { slug: string; name: string }) {
  const update = useAtomSet(updateProjectAtom)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [saving, setSaving] = useState(false)

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
    setSaving(true)
    try {
      await update({ slug, name: trimmed })
    } finally {
      setSaving(false)
      setEditing(false)
    }
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
      aria-label="Project name"
    />
  )
}

function ProjectMenu({ slug }: { slug: string }) {
  const remove = useAtomSet(deleteProjectAtom)
  const navigate = useNavigate()
  const [deleting, setDeleting] = useState(false)

  async function onDelete() {
    setDeleting(true)
    try {
      await remove({ slug })
      navigate({ to: "/projects" })
    } catch {
      setDeleting(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Project actions"
          className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring outline-none"
        >
          <MoreHorizontal className="size-4" strokeWidth={1.75} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-48">
        <DropdownMenuItem
          disabled={deleting}
          onSelect={(e) => {
            e.preventDefault()
            void onDelete()
          }}
          className="cursor-pointer text-destructive focus:text-destructive"
        >
          <Trash2 className="size-4" strokeWidth={1.75} />
          {deleting ? "Deleting…" : "Delete project"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// --- Tab nav ---------------------------------------------------------------
// Uses the shared `SegmentedTabs` primitive (`components/SegmentedTabs.tsx`)
// — same component the status chips inside the Tickets tab render with, so
// the two strips read as one design language. Each tab is a `<Link>`; the
// shared component owns chrome, animation, and count badges.

type TabKey = "tickets" | "about" | "members"
type TabDef = {
  key: TabKey
  to: "/projects/$slug" | "/projects/$slug/about" | "/projects/$slug/members"
  label: string
  icon: typeof ListChecks
  exact: boolean
  countFor?: "tickets" | "members"
}

const TABS: ReadonlyArray<TabDef> = [
  {
    key: "tickets",
    to: "/projects/$slug",
    label: "Tickets",
    icon: ListChecks,
    exact: true,
    countFor: "tickets"
  },
  {
    key: "about",
    to: "/projects/$slug/about",
    label: "About",
    icon: Info,
    exact: false
  },
  {
    key: "members",
    to: "/projects/$slug/members",
    label: "Members",
    icon: UsersIcon,
    exact: false,
    countFor: "members"
  }
]

function TabsNav({
  slug,
  project
}: {
  slug: string
  project: ProjectDetailType
}) {
  const location = useLocation()
  const base = `/projects/${slug}`
  const ticketsResult = useAtomValue(ticketsListAtom(slug))
  const ticketsCount = Result.isSuccess(ticketsResult)
    ? ticketsResult.value.length
    : null

  // The "open ticket" subtitle — when a ticket is expanded, surface its id
  // and a quick status summary right next to the Tickets tab. Keeps the
  // header informative even after deep-linking.
  const summary = Result.isSuccess(ticketsResult)
    ? summarize(ticketsResult.value)
    : null

  const isActive = (key: TabKey): boolean => {
    const t = TABS.find((x) => x.key === key)!
    const target = t.to.replace("$slug", slug)
    return t.exact
      ? location.pathname === target ||
          location.pathname === target + "/" ||
          location.pathname === base ||
          location.pathname === base + "/"
      : location.pathname === target ||
          location.pathname.startsWith(target + "/")
  }

  // Counts come from atoms here, not from the static config — the tab strip
  // doubles as a live readout of project state. The tickets tab gets a
  // hover-reveal breakdown via badgeNode; the others use the plain badge.
  const tickets = Result.isSuccess(ticketsResult) ? ticketsResult.value : []
  const items: ReadonlyArray<SegmentedItem<TabKey>> = TABS.map((t) => {
    if (t.key === "tickets") {
      return {
        key: t.key,
        label: t.label,
        icon: t.icon,
        badgeNode:
          ticketsCount === null ? null : <TicketsBadge tickets={tickets} />
      }
    }
    return {
      key: t.key,
      label: t.label,
      icon: t.icon,
      badge:
        t.countFor === "members" ? project.members.length : null
    }
  })

  return (
    <div className="flex flex-wrap items-center gap-3">
      <SegmentedTabs
        items={items}
        layoutId={`project-tabs-${slug}`}
        isActive={isActive}
        renderItem={(item, content, { active }) => {
          const def = TABS.find((t) => t.key === item.key)!
          return (
            <Link
              to={def.to}
              params={{ slug }}
              className={SEGMENTED_ITEM_CLASS(active)}
            >
              {content}
            </Link>
          )
        }}
      />

      {summary && (
        <span className="text-xs text-muted-foreground">{summary}</span>
      )}
    </div>
  )
}

// Hover-reveal count badge for the Tickets tab. At rest, a single "12"
// pill (chrome'd like other tabs' badges). On parent-tab hover, fades to a
// per-status breakdown — todo / in_progress / done — using the same icons
// and colors as the StatusButton in TicketList. Width is reserved at rest
// by rendering the breakdown invisibly underneath, so sibling tabs don't
// shift when the user mouses over.
//
// When custom statuses land we'll iterate over a status registry instead
// of hardcoding the three defaults; for now three is the universe.
function TicketsBadge({ tickets }: { tickets: ReadonlyArray<Ticket> }) {
  const total = tickets.length
  let todo = 0
  let inProgress = 0
  let done = 0
  for (const t of tickets) {
    if (t.status === "todo") todo++
    else if (t.status === "in_progress") inProgress++
    else done++
  }

  return (
    <span className="relative inline-grid place-items-center">
      {/* Reserve width with an invisible breakdown so the tab strip doesn't
          reflow on hover. The visible variants overlay this in the same
          grid cell. */}
      <span className="invisible col-start-1 row-start-1 inline-flex items-center gap-1 px-1">
        <BadgeStat
          count={todo}
          icon={CircleDashed}
          className="text-muted-foreground"
        />
        <BadgeStat
          count={inProgress}
          icon={CircleDot}
          className="text-blue-500"
        />
        <BadgeStat count={done} icon={Check} className="text-emerald-500" />
      </span>

      {/* At-rest total — small pill, matches other tabs' chrome. */}
      <span className="col-start-1 row-start-1 transition-opacity duration-150 group-hover/seg-item:opacity-0">
        <span className="rounded-full bg-foreground/10 px-1.5 font-mono text-[10px] tabular-nums text-foreground">
          {total}
        </span>
      </span>

      {/* Hover breakdown — bare counts with status icons, no pill chrome
          so the detail reads as informational rather than another control. */}
      <span className="col-start-1 row-start-1 inline-flex items-center gap-1 px-1 opacity-0 transition-opacity duration-150 group-hover/seg-item:opacity-100">
        <BadgeStat
          count={todo}
          icon={CircleDashed}
          className="text-muted-foreground"
        />
        <BadgeStat
          count={inProgress}
          icon={CircleDot}
          className="text-blue-500"
        />
        <BadgeStat count={done} icon={Check} className="text-emerald-500" />
      </span>
    </span>
  )
}

function BadgeStat({
  count,
  icon: Icon,
  className
}: {
  count: number
  icon: typeof Check
  className: string
}) {
  return (
    <span className="inline-flex items-center gap-0.5 font-mono text-[10px] tabular-nums text-foreground">
      <Icon className={`size-3 ${className}`} strokeWidth={1.75} />
      {count}
    </span>
  )
}

// "5 todo · 4 in progress · 3 done" — quick at-a-glance state. Shows next to
// the tab strip so the project header doubles as a dashboard.
function summarize(tickets: ReadonlyArray<Ticket>): string | null {
  if (tickets.length === 0) return null
  let todo = 0
  let inProgress = 0
  let done = 0
  for (const t of tickets) {
    if (t.status === "todo") todo++
    else if (t.status === "in_progress") inProgress++
    else done++
  }
  return `${todo} todo · ${inProgress} in progress · ${done} done`
}

// --- States ---------------------------------------------------------------

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
        <CardTitle>Project not found</CardTitle>
        <CardDescription>
          No project at <span className="font-mono">/{slug}</span>. It may have
          been removed, or you may not have access.
        </CardDescription>
      </CardHeader>
    </Card>
  )
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Couldn't load project</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
    </Card>
  )
}
