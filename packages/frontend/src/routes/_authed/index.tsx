// Dashboard — first thing the user sees on sign-in.
//
// Surfaces the shortcuts that matter day-to-day: jump back into a recent
// project, see what's still open, get to creation fast. We deliberately
// don't try to be a "feed" — projects are markdown files on disk, the
// dashboard is just a launcher.

import { Result, useAtomValue } from "@effect-atom/atom-react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowRight, FolderKanban, Plus } from "lucide-react"
import { meAtom } from "@/atoms/auth"
import { projectsListAtom } from "@/atoms/projects"
import { PageContainer, PageHeader } from "@/components/page"
import { formatRelative } from "@/lib/relative-time"
import { cn } from "@/lib/utils"
import type { Project } from "@projectproject/shared"

export const Route = createFileRoute("/_authed/")({
  component: Dashboard,
  loader: () => ({
    crumb: { type: "static" as const, label: "Dashboard", to: "/" }
  })
})

function Dashboard() {
  const me = useAtomValue(meAtom)
  const list = useAtomValue(projectsListAtom)
  const name = Result.isSuccess(me) ? me.value.name.split(" ")[0] : "there"
  const greeting = greet()

  return (
    <PageContainer>
      <PageHeader>
        <h1>
          {greeting}, {name}.
        </h1>
        <p>Pick up where you left off, or start something new.</p>
      </PageHeader>

      {Result.matchWithError(list, {
        onInitial: () => <TilesSkeleton />,
        onError: () => <NewProjectCTA />,
        onDefect: () => <NewProjectCTA />,
        onSuccess: ({ value }) =>
          value.length === 0 ? (
            <NewProjectCTA />
          ) : (
            <RecentProjects projects={value} />
          )
      })}
    </PageContainer>
  )
}

// "Good morning / afternoon / evening" — a tiny attentive touch. Times
// roughly to the user's local hours; no need for fancy timezone work.
function greet(): string {
  const h = new Date().getHours()
  if (h < 5) return "Working late"
  if (h < 12) return "Good morning"
  if (h < 18) return "Good afternoon"
  return "Good evening"
}

function RecentProjects({ projects }: { projects: ReadonlyArray<Project> }) {
  // Surface up to 6 projects — sorted most-recently-created first. The full
  // list lives behind the "All projects" link.
  const sorted = [...projects].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  )
  const top = sorted.slice(0, 6)
  const hasMore = sorted.length > top.length

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight">
          Recent projects
        </h2>
        <Link
          to="/projects"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          All projects
          <ArrowRight className="size-3.5" strokeWidth={1.75} />
        </Link>
      </div>

      <div className="grid gap-2 @container sm:grid-cols-2 lg:grid-cols-3">
        {top.map((p) => (
          <ProjectTile key={p.slug} project={p} />
        ))}
        <NewProjectTile compact={top.length > 0} />
      </div>

      {hasMore && (
        <p className="text-xs text-muted-foreground">
          {sorted.length - top.length} more — see{" "}
          <Link to="/projects" className="underline-offset-2 hover:underline">
            all projects
          </Link>
          .
        </p>
      )}
    </section>
  )
}

function ProjectTile({ project }: { project: Project }) {
  return (
    <Link
      to="/projects/$slug"
      params={{ slug: project.slug }}
      className={cn(
        "group flex flex-col gap-3 rounded-xl border border-border bg-background p-4 transition-all",
        "hover:border-border/80 hover:bg-accent/30 hover:shadow-sm"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-background group-hover:text-foreground">
          <FolderKanban className="size-4" strokeWidth={1.75} />
        </div>
        <ArrowRight
          className="size-4 shrink-0 -translate-x-1 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"
          strokeWidth={1.75}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{project.name}</div>
        <div className="truncate font-mono text-xs text-muted-foreground">
          /{project.slug}
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        Created {formatRelative(project.createdAt)}
      </div>
    </Link>
  )
}

function NewProjectTile({ compact }: { compact: boolean }) {
  return (
    <Link
      to="/projects"
      className={cn(
        "group flex flex-col gap-3 rounded-xl border border-dashed border-border bg-background/50 p-4 transition-colors",
        "hover:border-border hover:bg-accent/30",
        // When sitting next to real tiles, keep visual weight similar so the
        // dashed border doesn't read as "this row is broken". Standalone CTA
        // (no projects yet) gets a friendlier full-card layout instead.
        compact ? "min-h-[8rem] items-center justify-center text-center" : ""
      )}
    >
      <div className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-background group-hover:text-foreground">
        <Plus className="size-4" strokeWidth={1.75} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">New project</div>
        <div className="truncate text-xs text-muted-foreground">
          Spin up a fresh markdown workspace
        </div>
      </div>
    </Link>
  )
}

function NewProjectCTA() {
  return (
    <Link
      to="/projects"
      className={cn(
        "group flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-background/50 px-6 py-12 text-center transition-colors",
        "hover:border-border hover:bg-accent/30"
      )}
    >
      <div className="grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground transition-colors group-hover:bg-background group-hover:text-foreground">
        <Plus className="size-5" strokeWidth={1.75} />
      </div>
      <div>
        <div className="text-sm font-medium">Create your first project</div>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          Markdown-first project management. Tickets, members, and project
          context all live as files on disk — yours to grep, edit, or feed to an
          AI.
        </p>
      </div>
    </Link>
  )
}

function TilesSkeleton() {
  return (
    <section className="flex flex-col gap-3">
      <div className="h-6 w-40 animate-pulse rounded-md bg-muted/60" />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-xl border border-border bg-background"
          />
        ))}
      </div>
    </section>
  )
}
