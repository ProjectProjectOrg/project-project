import { GroupId, PinTarget, TicketId } from "@pp/shared"
import * as Data from "effect/Data"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

export type ProjectPage = "backlog" | "sprints" | "about" | "settings"

export type ProjectRoute = Readonly<{
  page: ProjectPage
  sub: string | null
}>

export type SidebarScope = Data.TaggedEnum<{
  changelog: {}
  dashboard: Readonly<{ page: "overview" | "inbox" | "projects" | null }>
  project: Readonly<{
    slug: string
    route: ProjectRoute
    viewing: PinTarget | null
  }>
  none: {}
}>
export const SidebarScope = Data.taggedEnum<SidebarScope>()

const SETTINGS_PATH = /^\/settings(?:\/|$)/

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
  if (pathname === "/changelog" || pathname.startsWith("/changelog/"))
    return SidebarScope.changelog()
  if (orgSlug === null) return SidebarScope.none()
  const settingsPrefix = `/settings/orgs/${orgSlug}/projects/`
  if (pathname.startsWith(settingsPrefix)) {
    const [slug = "", sub = ""] = pathname
      .slice(settingsPrefix.length)
      .split("/")
    return SidebarScope.project({
      slug,
      route: { page: "settings", sub: sub || null },
      viewing: null
    })
  }
  const orgPrefix = `/orgs/${orgSlug}`
  if (pathname !== orgPrefix && !pathname.startsWith(`${orgPrefix}/`))
    return SidebarScope.none()
  const [area = "", slug = "", section = "", sub = ""] = pathname
    .slice(orgPrefix.length + 1)
    .split("/")
  if (area !== "projects")
    return SidebarScope.dashboard({
      page: area === "" ? "overview" : area === "inbox" ? "inbox" : null
    })
  if (slug === "") return SidebarScope.dashboard({ page: "projects" })
  const viewing = viewingIn(section, sub)
  if (section === "tickets" && fromSprint !== undefined)
    return SidebarScope.project({
      slug,
      route: { page: "sprints", sub: fromSprint },
      viewing
    })
  const page = PROJECT_SECTIONS.find((key) => key === section) ?? "backlog"
  return SidebarScope.project({
    slug,
    route: { page, sub: sub || null },
    viewing
  })
}

export const PROJECT_PAGE_PATHS = {
  backlog: "/orgs/$orgSlug/projects/$slug",
  sprints: "/orgs/$orgSlug/projects/$slug/sprints",
  about: "/orgs/$orgSlug/projects/$slug/about",
  settings: "/settings/orgs/$orgSlug/projects/$slug"
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
