import type { Project } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import { ChevronsUpDown } from "lucide-react"
import { useEffect, useRef, useState, type ReactNode } from "react"

import { useNavHoverItem } from "@/components/shell/NavItem"
import { ProjectCardBanner } from "@/components/shell/ProjectCardBanner"
import { ProjectNav, type ProjectRoute } from "@/components/shell/ProjectNav"
import { ProjectMenuItems } from "@/components/shell/ProjectPicker"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { projectRequest } from "@/features/projects/atoms/projects"
import { ProjectIconTile } from "@/features/projects/components/ProjectIconTile"
import { ProjectSetupLine } from "@/features/projects/components/ProjectSetupLine"
import { ProjectContext } from "@/features/projects/hooks/useProject"
import { useScopedProject } from "@/features/projects/hooks/useScopedProject"
import { useActiveSprint } from "@/features/sprints/hooks/useActiveSprint"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export const PROJECT_CARD_HOVER_INDEX = 2

const PROJECT_SECTIONS = ["sprints", "about", "settings"] as const

const PAGE_PATHS = {
  backlog: "/orgs/$orgSlug/projects/$slug",
  sprints: "/orgs/$orgSlug/projects/$slug/sprints",
  about: "/orgs/$orgSlug/projects/$slug/about",
  settings: "/orgs/$orgSlug/projects/$slug/settings"
} as const satisfies Record<ProjectRoute["page"], string>

export type ProjectRouteMatch = Readonly<{ slug: string; route: ProjectRoute }>

export function matchProjectRoute(
  pathname: string,
  orgSlug: string,
  fromSprint: string | undefined
): ProjectRouteMatch | null {
  const prefix = `/orgs/${orgSlug}/projects/`
  if (!pathname.startsWith(prefix)) return null
  const [slug, section = "", sub = ""] = pathname
    .slice(prefix.length)
    .split("/")
  if (!slug) return null
  if (section === "tickets" && fromSprint !== undefined)
    return { slug, route: { page: "sprints", sub: fromSprint } }
  const page = PROJECT_SECTIONS.find((key) => key === section) ?? "backlog"
  return { slug, route: { page, sub: sub || null } }
}

export function ProjectScope({
  orgSlug,
  match
}: {
  orgSlug: string
  match: ProjectRouteMatch | null
}) {
  const { project, projects } = useScopedProject(orgSlug, match?.slug ?? null)
  if (!project) return null

  return (
    <div className="flex flex-col gap-1 pt-3">
      <div className="px-3 pb-1 text-caption font-semibold text-muted-foreground">
        {m.chrome_sidebar_project_section_label()}
      </div>
      <ProjectContext value={projectRequest(orgSlug, project.slug)}>
        {projects.length > 1 ? (
          <ProjectSwitcher
            orgSlug={orgSlug}
            project={project}
            projects={projects}
            page={match?.route.page ?? "backlog"}
          />
        ) : (
          <ProjectCardLink orgSlug={orgSlug} project={project} />
        )}
        <ProjectNav
          orgSlug={orgSlug}
          slug={project.slug}
          route={match?.slug === project.slug ? match.route : null}
        />
      </ProjectContext>
    </div>
  )
}

const cardClass =
  "relative z-10 mb-1 overflow-hidden rounded-lg bg-card shadow-surface-1 has-[>:focus-visible]:ring-1 has-[>:focus-visible]:ring-ring"
const cardFaceClass =
  "block w-full text-left transition-colors outline-none hover:bg-hover"

function ProjectCardLink({
  orgSlug,
  project
}: {
  orgSlug: string
  project: Project
}) {
  const ref = useRef<HTMLAnchorElement>(null)
  useNavHoverItem(PROJECT_CARD_HOVER_INDEX, ref)
  return (
    <div className={cardClass}>
      <Link
        ref={ref}
        to="/orgs/$orgSlug/projects/$slug"
        params={{ orgSlug, slug: project.slug }}
        className={cardFaceClass}
      >
        <ProjectFace orgSlug={orgSlug} project={project} trailing={null} />
      </Link>
      <ProjectSetupLine />
    </div>
  )
}

function ProjectSwitcher({
  orgSlug,
  project,
  projects,
  page
}: {
  orgSlug: string
  project: Project
  projects: ReadonlyArray<Project>
  page: ProjectRoute["page"]
}) {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState(false)
  const cardRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  useNavHoverItem(PROJECT_CARD_HOVER_INDEX, cardRef)
  useEffect(() => {
    if (!open) return undefined
    const frame = requestAnimationFrame(() =>
      menuRef.current
        ?.querySelector<HTMLElement>('[aria-checked="true"]')
        ?.focus()
    )
    return () => cancelAnimationFrame(frame)
  }, [open])
  const changeOpen = (next: boolean) => {
    if (next) setPicked(false)
    setOpen(next)
  }
  const pick = () => {
    setPicked(true)
    changeOpen(false)
  }
  return (
    <div ref={containerRef} className={cardClass}>
      <DropdownMenu open={open} onOpenChange={changeOpen}>
        <DropdownMenuTrigger
          ref={cardRef}
          aria-label={m.chrome_sidebar_project_switcher_aria_label()}
          className={cn(cardFaceClass, "data-[popup-open]:bg-hover")}
        >
          <ProjectFace
            orgSlug={orgSlug}
            project={project}
            trailing={
              <ChevronsUpDown
                className="size-3.5 shrink-0 text-muted-foreground"
                strokeWidth={1.75}
              />
            }
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          ref={menuRef}
          side="bottom"
          align="start"
          sideOffset={6}
          anchor={containerRef}
          className={cn("w-72", picked && "data-[closed]:hidden")}
        >
          <ProjectMenuItems
            orgSlug={orgSlug}
            currentSlug={project.slug}
            projects={projects}
            onPick={pick}
            linkFor={(slug) => ({
              to: PAGE_PATHS[page],
              params: { orgSlug, slug }
            })}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      <ProjectSetupLine />
    </div>
  )
}

function ProjectFace({
  orgSlug,
  project,
  trailing
}: {
  orgSlug: string
  project: Project
  trailing: ReactNode
}) {
  const activeSprint = useActiveSprint(orgSlug, project.slug)
  return (
    <>
      <ProjectCardBanner orgSlug={orgSlug} project={project} />
      <span className="flex items-center gap-2.5 px-3 pt-1 pb-3">
        <ProjectIconTile
          orgSlug={orgSlug}
          icon={project.icon}
          iconImage={project.iconImage}
          color={project.color}
          size="compact"
          seed={project.slug}
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-body font-semibold text-foreground">
            {project.name}
          </span>
          <span className="truncate text-caption text-muted-foreground">
            {activeSprint?.label ?? project.key}
          </span>
        </span>
        {trailing}
      </span>
    </>
  )
}
