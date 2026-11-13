import type { Project } from "@pp/shared"
import { useRouter, type NavigateOptions } from "@tanstack/react-router"
import { LayoutGrid } from "lucide-react"

import { ProjectBannerWarmup } from "@/components/shell/ProjectCardBanner"
import {
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu"
import { ProjectIconTile } from "@/features/projects/components/ProjectIconTile"
import { useActiveSprint } from "@/features/sprints/hooks/useActiveSprint"
import { m } from "@/paraglide/messages"

export function ProjectMenuItems({
  orgSlug,
  currentSlug,
  projects,
  onPick,
  linkFor
}: {
  orgSlug: string
  currentSlug: string
  projects: ReadonlyArray<Project>
  onPick: () => void
  linkFor: (slug: string) => NavigateOptions
}) {
  const router = useRouter()
  const preload = (slug: string) => void router.preloadRoute(linkFor(slug))
  const items = projects.map((project) => ({
    value: project.slug,
    textValue: project.name,
    closeOnClick: true,
    label: (
      <ProjectOption
        orgSlug={orgSlug}
        project={project}
        onPointerEnter={() => preload(project.slug)}
      />
    )
  }))

  return (
    <>
      {projects
        .filter((project) => project.slug !== currentSlug)
        .map((project) => (
          <ProjectBannerWarmup
            key={project.slug}
            orgSlug={orgSlug}
            project={project}
          />
        ))}
      <div
        role="presentation"
        onFocus={(event) => {
          const slug =
            event.target instanceof Element
              ? event.target
                  .querySelector("[data-project-slug]")
                  ?.getAttribute("data-project-slug")
              : null
          if (slug) preload(slug)
        }}
      >
        <DropdownMenuRadioGroup
          items={items}
          value={currentSlug}
          onValueChange={(slug) => {
            onPick()
            if (slug === currentSlug) return
            void router.navigate(linkFor(slug))
          }}
        />
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onClick={() => {
          onPick()
          void router.navigate({
            to: "/orgs/$orgSlug/projects",
            params: { orgSlug }
          })
        }}
      >
        <LayoutGrid strokeWidth={1.75} />
        {m.org_dashboard_all_projects_link()}
      </DropdownMenuItem>
    </>
  )
}

function ProjectOption({
  orgSlug,
  project,
  onPointerEnter
}: {
  orgSlug: string
  project: Project
  onPointerEnter: () => void
}) {
  const activeSprint = useActiveSprint(orgSlug, project.slug)
  return (
    <span
      data-project-slug={project.slug}
      className="flex min-w-0 flex-1 items-center gap-2.5"
      onPointerEnter={onPointerEnter}
    >
      <ProjectIconTile
        orgSlug={orgSlug}
        icon={project.icon}
        iconImage={project.iconImage}
        color={project.color}
        size="compact"
        seed={project.slug}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{project.name}</span>
        <span className="truncate text-caption text-muted-foreground">
          {activeSprint?.label ?? project.key}
        </span>
      </span>
    </span>
  )
}
