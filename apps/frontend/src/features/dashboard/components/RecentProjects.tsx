import type { Project } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import { ArrowRight, Plus } from "lucide-react"

import { ProjectTile } from "@/features/dashboard/components/ProjectTile"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export function RecentProjects({
  orgSlug,
  projects,
  canCreate
}: Readonly<{
  orgSlug: string
  projects: ReadonlyArray<Project>
  canCreate: boolean
}>) {
  const sorted = [...projects].toSorted(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  )
  const top = sorted.slice(0, 3)
  const hasMore = sorted.length > top.length

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight">
          {m.org_dashboard_recent_projects_heading()}
        </h2>
        <Link
          to="/orgs/$orgSlug/projects"
          params={{ orgSlug }}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {m.org_dashboard_all_projects_link()}
          <ArrowRight className="size-3.5" strokeWidth={1.75} />
        </Link>
      </div>

      <div className="@container grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {top.map((p) => (
          <ProjectTile key={p.slug} orgSlug={orgSlug} project={p} />
        ))}
        {canCreate && (
          <NewProjectTile orgSlug={orgSlug} compact={top.length > 0} />
        )}
      </div>

      {hasMore && (
        <p className="text-xs text-muted-foreground">
          {m.org_dashboard_more_projects_prefix({
            count: sorted.length - top.length
          })}{" "}
          <Link
            to="/orgs/$orgSlug/projects"
            params={{ orgSlug }}
            className="underline-offset-2 hover:underline"
          >
            {m.org_dashboard_more_projects_link()}
          </Link>
          {m.org_dashboard_more_projects_suffix()}
        </p>
      )}
    </section>
  )
}

function NewProjectTile({
  orgSlug,
  compact
}: {
  orgSlug: string
  compact: boolean
}) {
  return (
    <Link
      to="/orgs/$orgSlug/projects"
      params={{ orgSlug }}
      className={cn(
        "group flex flex-col gap-3 rounded-xl border border-dashed border-border bg-background/50 p-4 transition-colors",
        "hover:border-border hover:bg-hover",
        compact ? "min-h-[8rem] items-center justify-center text-center" : ""
      )}
    >
      <div className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-background group-hover:text-foreground">
        <Plus className="size-4" strokeWidth={1.75} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {m.org_dashboard_new_project_tile_title()}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {m.org_dashboard_new_project_tile_subtitle()}
        </div>
      </div>
    </Link>
  )
}
