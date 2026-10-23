import type { Project } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import { ArrowRight } from "lucide-react"

import { ProjectBanner } from "@/features/projects/components/ProjectBanner"
import { ProjectIconTile } from "@/features/projects/components/ProjectIconTile"
import { formatRelative } from "@/lib/relativeTime"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export function ProjectTile({
  orgSlug,
  project
}: {
  orgSlug: string
  project: Project
}) {
  return (
    <Link
      to="/orgs/$orgSlug/projects/$slug"
      params={{ orgSlug, slug: project.slug }}
      className={cn(
        "group relative isolate flex flex-col gap-3 overflow-hidden rounded-xl border border-border bg-background p-4 transition-all",
        "hover:border-border/80 hover:bg-hover hover:shadow-sm"
      )}
    >
      <ProjectBanner
        orgSlug={orgSlug}
        slug={project.slug}
        banner={project.banner}
        variant="card"
      />
      <div className="flex items-start justify-between gap-2">
        <ProjectIconTile
          orgSlug={orgSlug}
          icon={project.icon}
          iconImage={project.iconImage}
          color={project.color}
          size="sm"
          seed={project.slug}
        />
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
        {m.org_dashboard_project_created_label({
          when: formatRelative(project.createdAt)
        })}
      </div>
    </Link>
  )
}
