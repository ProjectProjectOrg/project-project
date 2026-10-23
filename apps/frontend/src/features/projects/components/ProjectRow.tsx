import { type Project } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import { ChevronRight } from "lucide-react"

import { ProjectBanner } from "@/features/projects/components/ProjectBanner"
import { ProjectIconTile } from "@/features/projects/components/ProjectIconTile"
import { formatRelative } from "@/lib/relativeTime"
import { cn } from "@/lib/utils"

export function ProjectRow({
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
        "group relative isolate flex items-center gap-3 overflow-hidden rounded-lg border border-border bg-card px-3 py-2.5 transition-colors",
        "hover:bg-hover"
      )}
    >
      <ProjectBanner
        orgSlug={orgSlug}
        slug={project.slug}
        banner={project.banner}
        variant="row"
      />
      <ProjectIconTile
        orgSlug={orgSlug}
        icon={project.icon}
        iconImage={project.iconImage}
        color={project.color}
        size="sm"
        seed={project.slug}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{project.name}</div>
        <div className="truncate font-mono text-xs text-muted-foreground">
          {project.key} /{project.slug}
        </div>
      </div>
      <div className="hidden shrink-0 text-xs text-muted-foreground sm:block">
        {formatRelative(project.createdAt)}
      </div>
      <ChevronRight
        className="size-4 shrink-0 -translate-x-1 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"
        strokeWidth={1.75}
      />
    </Link>
  )
}
