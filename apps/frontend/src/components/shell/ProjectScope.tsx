import { useAtomValue } from "@effect/atom-react"
import type { Project } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import * as Schema from "effect/Schema"
import {
  CalendarRange,
  ChevronsUpDown,
  Info,
  ListChecks,
  Settings,
  type LucideIcon
} from "lucide-react"
import { useEffect, useRef, useState, type ReactNode } from "react"

import { navFocusRing, useNavHoverItem } from "@/components/shell/NavItem"
import { ProjectCardBanner } from "@/components/shell/ProjectCardBanner"
import { ProjectMenuItems } from "@/components/shell/ProjectPicker"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { currentUserId } from "@/features/auth/atoms/auth"
import {
  projectsFor,
  projectsRequest
} from "@/features/projects/atoms/projects"
import { ProjectIconTile } from "@/features/projects/components/ProjectIconTile"
import { useActiveSprint } from "@/features/sprints/hooks/useActiveSprint"
import {
  createLocalStorageStringCodec,
  useLocalStorageState
} from "@/hooks/useLocalStorageState"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

const PROJECT_PAGES = [
  { key: "backlog", to: "/orgs/$orgSlug/projects/$slug", icon: ListChecks },
  {
    key: "sprints",
    to: "/orgs/$orgSlug/projects/$slug/sprints",
    icon: CalendarRange
  },
  { key: "about", to: "/orgs/$orgSlug/projects/$slug/about", icon: Info },
  {
    key: "settings",
    to: "/orgs/$orgSlug/projects/$slug/settings",
    icon: Settings
  }
] as const

type ProjectPage = (typeof PROJECT_PAGES)[number]["key"]

const PAGE_INDEX_OFFSET = 1

export const projectPageHoverIndex = (page: ProjectPage) =>
  PAGE_INDEX_OFFSET + PROJECT_PAGES.findIndex((p) => p.key === page)

export const PROJECT_CARD_HOVER_INDEX = PAGE_INDEX_OFFSET + PROJECT_PAGES.length

export type ProjectRouteMatch = Readonly<{ slug: string; page: ProjectPage }>

export function matchProjectRoute(
  pathname: string,
  orgSlug: string
): ProjectRouteMatch | null {
  const prefix = `/orgs/${orgSlug}/projects/`
  if (!pathname.startsWith(prefix)) return null
  const [slug, section = ""] = pathname.slice(prefix.length).split("/")
  if (!slug) return null
  const page = PROJECT_PAGES.find((p) => p.key === section)?.key ?? "backlog"
  return { slug, page }
}

const lastProjectCodec = createLocalStorageStringCodec(Schema.String)

export function ProjectScope({
  orgSlug,
  match
}: {
  orgSlug: string
  match: ProjectRouteMatch | null
}) {
  const viewerId = useAtomValue(currentUserId)
  const [lastSlug, setLastSlug] = useLocalStorageState(
    `projectproject:sidebar-project:${viewerId ?? ""}:${orgSlug}`,
    lastProjectCodec,
    ""
  )
  const routeSlug = match?.slug ?? null
  useEffect(() => {
    if (routeSlug !== null) setLastSlug(routeSlug)
  }, [routeSlug, setLastSlug])

  const listResult = useAtomValue(projectsFor(projectsRequest(orgSlug)))
  const projects = Result.isSuccess(listResult)
    ? listResult.value.toSorted((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      )
    : []
  const project =
    projects.find((p) => p.slug === (routeSlug ?? lastSlug)) ?? projects[0]
  if (!project) return null

  return (
    <div className="flex flex-col gap-1 pt-3">
      <div className="px-3 pb-1 text-caption font-semibold text-muted-foreground">
        {m.chrome_sidebar_project_section_label()}
      </div>
      <ProjectSwitcher
        orgSlug={orgSlug}
        project={project}
        projects={projects}
      />
      <ProjectPages
        orgSlug={orgSlug}
        slug={project.slug}
        activePage={match?.slug === project.slug ? match.page : null}
      />
    </div>
  )
}

function ProjectSwitcher({
  orgSlug,
  project,
  projects
}: {
  orgSlug: string
  project: Project
  projects: ReadonlyArray<Project>
}) {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState(false)
  const cardRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
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
    <DropdownMenu open={open} onOpenChange={changeOpen}>
      <DropdownMenuTrigger
        ref={cardRef}
        aria-label={m.chrome_sidebar_project_switcher_aria_label()}
        className="w-full overflow-hidden rounded-lg bg-card text-left transition-colors outline-none hover:bg-hover focus-visible:ring-1 focus-visible:ring-ring data-[popup-open]:bg-hover"
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
        className={cn("w-72", picked && "data-[closed]:hidden")}
      >
        <ProjectMenuItems
          orgSlug={orgSlug}
          currentSlug={project.slug}
          projects={projects}
          onPick={pick}
        />
      </DropdownMenuContent>
    </DropdownMenu>
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

function ProjectPages({
  orgSlug,
  slug,
  activePage
}: {
  orgSlug: string
  slug: string
  activePage: ProjectPage | null
}) {
  const activeSprint = useActiveSprint(orgSlug, slug)
  const labels: Record<ProjectPage, string> = {
    sprints: activeSprint?.sprint.name ?? m.project_detail_tab_sprints(),
    backlog: m.project_detail_tab_backlog(),
    about: m.project_detail_tab_about(),
    settings: m.project_detail_tab_settings()
  }
  return (
    <ul className="flex flex-col gap-1">
      {PROJECT_PAGES.map((page) => (
        <ProjectPageRow
          key={page.key}
          index={projectPageHoverIndex(page.key)}
          orgSlug={orgSlug}
          slug={slug}
          to={page.to}
          icon={page.icon}
          label={labels[page.key]}
          meta={page.key === "sprints" ? activeSprint?.countdown : undefined}
          active={page.key === activePage}
        />
      ))}
    </ul>
  )
}

function ProjectPageRow({
  index,
  orgSlug,
  slug,
  to,
  icon: Icon,
  label,
  meta,
  active
}: {
  index: number
  orgSlug: string
  slug: string
  to: (typeof PROJECT_PAGES)[number]["to"]
  icon: LucideIcon
  label: string
  meta: string | undefined
  active: boolean
}) {
  const ref = useRef<HTMLAnchorElement>(null)
  useNavHoverItem(index, ref)
  return (
    <li className="flex">
      <Link
        ref={ref}
        to={to}
        params={{ orgSlug, slug }}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative z-10 flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 py-2 text-body transition-colors",
          navFocusRing,
          active
            ? "bg-accent font-semibold text-foreground"
            : "text-muted-foreground data-[fluid-hover-active]:text-foreground"
        )}
      >
        <Icon className="size-4 shrink-0" strokeWidth={1.75} />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {meta ? (
          <span className="shrink-0 text-caption font-normal text-muted-foreground">
            {meta}
          </span>
        ) : null}
      </Link>
    </li>
  )
}
