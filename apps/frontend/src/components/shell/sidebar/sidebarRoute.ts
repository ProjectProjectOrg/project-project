import { GroupId, PinTarget, TicketId } from "@pp/shared"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

export type ProjectPage = "backlog" | "sprints" | "about" | "settings"

export type ProjectRoute = Readonly<{
  page: ProjectPage
  sub: string | null
}>

export type SidebarScope =
  | Readonly<{ kind: "dashboard"; page: "overview" | "projects" | null }>
  | Readonly<{
      kind: "project"
      slug: string
      route: ProjectRoute
      viewing: PinTarget | null
    }>
  | Readonly<{ kind: "none" }>

const SETTINGS_PATH =
  /^\/(?:profile|orgs\/[^/]+\/settings|orgs\/[^/]+\/projects\/[^/]+\/settings)(?:\/|$)/

export const isSettingsPath = (pathname: string) => SETTINGS_PATH.test(pathname)

const PROJECT_SECTIONS = ["sprints", "about", "settings"] as const

const decodeTicketId = Schema.decodeUnknownOption(TicketId)
const decodeGroupId = Schema.decodeUnknownOption(GroupId)

const viewingIn = (section: string, sub: string) => {
  if (section === "tickets")
    return Option.match(decodeTicketId(sub), {
      onNone: () => null,
      onSome: (ref) => PinTarget.cases.ticket.make({ ref })
    })
  if (section === "sprints" && sub !== "current")
    return Option.match(decodeGroupId(sub), {
      onNone: () => null,
      onSome: (ref) => PinTarget.cases.sprint.make({ ref })
    })
  return null
}

export function sidebarScope(
  pathname: string,
  orgSlug: string | null,
  fromSprint: string | undefined
) {
  if (orgSlug === null) return { kind: "none" } satisfies SidebarScope
  const orgPrefix = `/orgs/${orgSlug}`
  if (pathname !== orgPrefix && !pathname.startsWith(`${orgPrefix}/`))
    return { kind: "none" } satisfies SidebarScope
  const [area = "", slug = "", section = "", sub = ""] = pathname
    .slice(orgPrefix.length + 1)
    .split("/")
  if (area === "settings") return { kind: "none" } satisfies SidebarScope
  if (area !== "projects")
    return {
      kind: "dashboard",
      page: area === "" ? "overview" : null
    } satisfies SidebarScope
  if (slug === "")
    return { kind: "dashboard", page: "projects" } satisfies SidebarScope
  const viewing = viewingIn(section, sub)
  if (section === "tickets" && fromSprint !== undefined)
    return {
      kind: "project",
      slug,
      route: { page: "sprints", sub: fromSprint },
      viewing
    } satisfies SidebarScope
  const page = PROJECT_SECTIONS.find((key) => key === section) ?? "backlog"
  return {
    kind: "project",
    slug,
    route: { page, sub: sub || null },
    viewing
  } satisfies SidebarScope
}

export const PROJECT_PAGE_PATHS = {
  backlog: "/orgs/$orgSlug/projects/$slug",
  sprints: "/orgs/$orgSlug/projects/$slug/sprints",
  about: "/orgs/$orgSlug/projects/$slug/about",
  settings: "/orgs/$orgSlug/projects/$slug/settings"
} as const satisfies Record<ProjectPage, string>

export type ProjectNavActive =
  | "backlog"
  | "sprints"
  | "current"
  | "about"
  | null

export function projectNavActive(
  route: ProjectRoute,
  activeSprintId: string | null,
  viewingPinned: boolean
) {
  if (viewingPinned) return null
  if (route.page === "sprints") {
    const onCurrent =
      route.sub === "current" ||
      (activeSprintId !== null && route.sub === activeSprintId)
    return onCurrent ? "current" : "sprints"
  }
  if (route.page === "settings") return null
  return route.page
}

export const SETTINGS_PANEL = "settings"
export const DASHBOARD_PANEL = "dash"

// The rail's order, top to bottom, for panelTransition.
export const railOrder = (projects: ReadonlyArray<{ slug: string }>) => [
  DASHBOARD_PANEL,
  ...projects.map((project) => project.slug)
]

export type PanelTransition = "up" | "down" | "forward" | "back" | "none"

export function panelTransition(
  from: string,
  to: string,
  order: ReadonlyArray<string>
) {
  if (from === to) return "none"
  if (to === SETTINGS_PANEL) return "forward"
  if (from === SETTINGS_PANEL) return "back"
  const before = order.indexOf(from)
  const after = order.indexOf(to)
  if (before === -1 || after === -1) return "none"
  return after > before ? "up" : "down"
}
