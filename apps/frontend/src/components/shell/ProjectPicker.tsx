import type { Project } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import { Check } from "lucide-react"
import { useRef } from "react"

import { navFocusRing } from "@/components/shell/NavItem"
import { FluidHoverHighlight } from "@/components/ui/fluid-hover-highlight"
import { ProjectIconTile } from "@/features/projects/components/ProjectIconTile"
import { useActiveSprint } from "@/features/sprints/hooks/useActiveSprint"
import {
  useFluidHover,
  useRegisterFluidHoverItem,
  type UseFluidHoverReturn
} from "@/hooks/useFluidHover"
import { cn } from "@/lib/utils"

export function ProjectPickerList({
  orgSlug,
  currentSlug,
  projects,
  onPick
}: {
  orgSlug: string
  currentSlug: string
  projects: ReadonlyArray<Project>
  onPick: () => void
}) {
  const listRef = useRef<HTMLUListElement>(null)
  const hover = useFluidHover(listRef)
  const currentIndex = projects.findIndex((p) => p.slug === currentSlug)
  return (
    <div
      role="presentation"
      onMouseEnter={hover.handlers.onMouseEnter}
      onMouseMove={hover.handlers.onMouseMove}
      onMouseLeave={hover.handlers.onMouseLeave}
      className="max-h-96 overflow-y-auto"
    >
      <ul ref={listRef} className="relative flex flex-col">
        <FluidHoverHighlight
          hover={hover}
          hidden={hover.activeIndex === currentIndex}
          className="rounded-md"
        />
        {projects.map((p, index) => (
          <ProjectPickerRow
            key={p.slug}
            index={index}
            register={hover.registerItem}
            orgSlug={orgSlug}
            project={p}
            current={p.slug === currentSlug}
            onPick={onPick}
          />
        ))}
      </ul>
    </div>
  )
}

function ProjectPickerRow({
  index,
  register,
  orgSlug,
  project,
  current,
  onPick
}: {
  index: number
  register: UseFluidHoverReturn["registerItem"]
  orgSlug: string
  project: Project
  current: boolean
  onPick: () => void
}) {
  const ref = useRef<HTMLAnchorElement>(null)
  useRegisterFluidHoverItem(register, index, ref)
  const activeSprint = useActiveSprint(orgSlug, project.slug)
  return (
    <li>
      <Link
        ref={ref}
        to="/orgs/$orgSlug/projects/$slug"
        params={{ orgSlug, slug: project.slug }}
        onClick={onPick}
        aria-current={current ? "page" : undefined}
        className={cn(
          "relative z-10 flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors",
          navFocusRing,
          current
            ? "bg-active text-foreground"
            : "text-muted-foreground data-[fluid-hover-active]:text-foreground"
        )}
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
          <span className="truncate text-body">{project.name}</span>
          <span className="truncate text-caption text-muted-foreground">
            {activeSprint?.label ?? project.key}
          </span>
        </span>
        {current ? (
          <Check className="size-4 shrink-0" strokeWidth={1.75} />
        ) : null}
      </Link>
    </li>
  )
}
