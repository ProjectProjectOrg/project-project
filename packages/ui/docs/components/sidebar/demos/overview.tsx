import {
  CalendarRange,
  Info,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings
} from "@pp/ui/icons"
import { Kbd } from "@pp/ui/kbd"
import { Logo } from "@pp/ui/logo"
import { MemberAvatar } from "@pp/ui/member-avatar"
import {
  SidebarNote,
  SidebarPanel,
  SidebarPanelBody,
  SidebarRail,
  SidebarRailItem,
  SidebarRailSeparator,
  SidebarRow,
  SidebarRowAction,
  SidebarRowGroup,
  SidebarSection,
  SidebarSubRows,
  type SidebarPanelTransition
} from "@pp/ui/sidebar"
import { useState } from "react"

import {
  findSprint,
  findTicket,
  livePin,
  pinKey,
  PROJECTS,
  samePin,
  PARENTS,
  type PinRef,
  type Project,
  type Route
} from "./data"
import { SprintIcon, StatusIcon } from "./parts/marks"
import { PageView } from "./parts/page-view"
import { PanelHeader } from "./parts/panel-header"
import { ProjectTile, railTileItem } from "./parts/project-tile"
import { SettingsPanel } from "./parts/settings-panel"

type State = Readonly<{
  scope: string
  route: Route
  pins: Readonly<Record<string, ReadonlyArray<PinRef>>>
  landed: string | null
  transition: SidebarPanelTransition
}>

const ME = { id: "user_wouter", name: "Wouter Missler" }

const INITIAL: State = {
  scope: "atl",
  route: { page: "ticket", id: "ATL-3" },
  pins: {
    atl: [
      { kind: "ticket", id: "ATL-6" },
      { kind: "sprint", id: "s23" }
    ],
    bil: [{ kind: "ticket", id: "BIL-7" }],
    web: [],
    hello: []
  },
  landed: null,
  transition: "none"
}

type Actions = Readonly<{
  state: State
  go: (route: Route, scope?: string) => void
  togglePin: (slug: string, pin: PinRef) => void
  reorder: (slug: string, keys: ReadonlyArray<string>) => void
}>

function PinRow({
  actions,
  slug,
  pin,
  live = false
}: Readonly<{ actions: Actions; slug: string; pin: PinRef; live?: boolean }>) {
  const { state, go, togglePin } = actions
  const pinned = (state.pins[slug] ?? []).some((p) => samePin(p, pin))
  const ticket = pin.kind === "ticket" ? findTicket(pin.id) : undefined
  const sprint = pin.kind === "sprint" ? findSprint(pin.id) : undefined
  const label = ticket?.[1] ?? sprint?.[1] ?? pin.id
  return (
    <SidebarRow
      live={live}
      active={slug === state.scope && samePin(pin, livePin(state.route))}
      highlight={state.landed === pinKey(slug, pin)}
      icon={
        ticket ? (
          <StatusIcon status={ticket[2]} />
        ) : sprint ? (
          <SprintIcon state={sprint[3]} />
        ) : undefined
      }
      label={label}
      meta={
        ticket ? (
          <span className="text-micro tabular-nums">{ticket[0]}</span>
        ) : sprint?.[2] === "6d left" ? (
          "6d"
        ) : undefined
      }
      onClick={() => go({ page: pin.kind, id: pin.id }, slug)}
      action={
        <SidebarRowAction
          label={pinned ? "Unpin" : "Pin"}
          onClick={() => togglePin(slug, pin)}
        >
          {pinned ? <PinOff /> : <Pin />}
        </SidebarRowAction>
      }
    />
  )
}

type PinNode = Readonly<{ pin: PinRef; children: ReadonlyArray<PinNode> }>

// As the app nests its pins: a ticket goes under its parent's row when that
// row is in the list too, pinned or live.
const nestPins = (pins: ReadonlyArray<PinRef>) => {
  const here = (id: string | undefined) =>
    pins.find((pin) => pin.kind === "ticket" && pin.id === id)
  const parentOf = (pin: PinRef) =>
    pin.kind === "ticket" ? here(PARENTS.get(pin.id)) : undefined
  const node: (pin: PinRef) => PinNode = (pin) => ({
    pin,
    children: pins.filter((child) => parentOf(child) === pin).map(node)
  })
  return pins.filter((pin) => parentOf(pin) === undefined).map(node)
}

function PinTree({
  actions,
  slug,
  node,
  isLive
}: Readonly<{
  actions: Actions
  slug: string
  node: PinNode
  isLive: (pin: PinRef) => boolean
}>) {
  return (
    <>
      <PinRow
        actions={actions}
        slug={slug}
        pin={node.pin}
        live={isLive(node.pin)}
      />
      {node.children.length === 0 ? null : (
        <SidebarSubRows>
          {node.children.map((child) => (
            <PinTree
              key={pinKey(slug, child.pin)}
              actions={actions}
              slug={slug}
              node={child}
              isLive={isLive}
            />
          ))}
        </SidebarSubRows>
      )}
    </>
  )
}

function ProjectPanel({
  actions,
  project
}: Readonly<{ actions: Actions; project: Project }>) {
  const { state, go } = actions
  const { route } = state
  const pins = state.pins[project.slug] ?? []
  const live = livePin(route)
  const onCurrent = route.page === "sprint" && route.id === "s24"
  const showLive =
    live !== null && !onCurrent && !pins.some((p) => samePin(p, live))
  return (
    <>
      <SidebarPanelBody label={project.name}>
        <SidebarRow
          icon={<ListChecks />}
          label="Backlog"
          active={route.page === "backlog"}
          onClick={() => go({ page: "backlog" })}
        />
        <SidebarRow
          icon={<CalendarRange />}
          label="Sprints"
          active={route.page === "sprints"}
          onClick={() => go({ page: "sprints" })}
        />
        {project.sprint ? (
          <SidebarSubRows>
            <SidebarRow
              label="Current"
              meta="6d"
              active={onCurrent}
              onClick={() => go({ page: "sprint", id: "s24" })}
            />
          </SidebarSubRows>
        ) : null}
        <SidebarRow
          icon={<Info />}
          label="About"
          active={route.page === "about"}
          onClick={() => go({ page: "about" })}
        />
        <SidebarRow
          icon={<Settings />}
          label="Settings"
          submenu
          onClick={() => go({ page: "settings", id: "general" })}
        />
        <SidebarSection label="Pinned" count={pins.length}>
          <SidebarRowGroup
            onReorder={(keys) => actions.reorder(project.slug, keys)}
            isSortable={(key) =>
              pins.some((p) => pinKey(project.slug, p) === key)
            }
          >
            {nestPins([...(showLive ? [live] : []), ...pins]).map((node) => (
              <PinTree
                key={pinKey(project.slug, node.pin)}
                actions={actions}
                slug={project.slug}
                node={node}
                isLive={(pin) => !pins.some((p) => samePin(p, pin))}
              />
            ))}
          </SidebarRowGroup>
          {pins.length === 0 && !showLive ? (
            <SidebarNote>
              Open a ticket or sprint and pin it to keep it here.
            </SidebarNote>
          ) : null}
        </SidebarSection>
      </SidebarPanelBody>
    </>
  )
}

function DashboardPanel({ actions }: Readonly<{ actions: Actions }>) {
  const { state, go } = actions
  return (
    <>
      <SidebarPanelBody label="Dashboard">
        <SidebarRow
          icon={<LayoutDashboard />}
          label="Overview"
          active={state.route.page === "overview"}
          onClick={() => go({ page: "overview" }, "dash")}
        />
        <SidebarRow
          icon={<LayoutGrid />}
          label="All projects"
          active={state.route.page === "projects"}
          onClick={() => go({ page: "projects" }, "dash")}
        />
        {PROJECTS.filter((p) => (state.pins[p.slug] ?? []).length > 0).map(
          (project) => (
            <SidebarSection
              key={project.slug}
              label={project.name}
              icon={
                <span
                  aria-hidden
                  className="size-1.5 rounded-[2px]"
                  style={{ background: project.tone }}
                />
              }
            >
              <SidebarRowGroup
                onReorder={(keys) => actions.reorder(project.slug, keys)}
              >
                {nestPins(state.pins[project.slug] ?? []).map((node) => (
                  <PinTree
                    key={pinKey(project.slug, node.pin)}
                    actions={actions}
                    slug={project.slug}
                    node={node}
                    isLive={() => false}
                  />
                ))}
              </SidebarRowGroup>
            </SidebarSection>
          )
        )}
      </SidebarPanelBody>
    </>
  )
}

function Rail({ actions }: Readonly<{ actions: Actions }>) {
  const { state, go } = actions
  return (
    <SidebarRail
      label="Projects"
      top={
        // The app's logo is the org switcher's trigger: a rail item.
        <SidebarRailItem label="Switch organization">
          <Logo className="size-[22px]" />
        </SidebarRailItem>
      }
      bottom={
        <>
          <SidebarRailItem
            label="Search"
            tooltip={
              <span className="flex items-center gap-2">
                Search <Kbd size="sm">⌘K</Kbd>
              </span>
            }
          >
            <Search />
          </SidebarRailItem>
          <SidebarRailItem label={ME.name}>
            <MemberAvatar member={ME} size={28} />
          </SidebarRailItem>
        </>
      }
    >
      <SidebarRailItem
        label="Dashboard"
        active={state.scope === "dash"}
        onClick={() => go({ page: "overview" }, "dash")}
      >
        <LayoutDashboard />
      </SidebarRailItem>
      <SidebarRailSeparator />
      {PROJECTS.map((project) => (
        <SidebarRailItem
          key={project.slug}
          label={project.name}
          tone={project.tone}
          {...railTileItem}
          active={state.scope === project.slug}
          onClick={() => go({ page: "backlog" }, project.slug)}
        >
          <ProjectTile
            slug={project.slug}
            icon={project.icon}
            color={project.tone}
          />
        </SidebarRailItem>
      ))}
      <SidebarRailItem label="New project">
        <Plus />
      </SidebarRailItem>
    </SidebarRail>
  )
}

const RAIL_ORDER = ["dash", ...PROJECTS.map((p) => p.slug)]

// Rail switches move the panel up or down with the bar; settings is a
// sub-page, so it slides in from the side and back out the way it came.
function panelTransition(state: State, route: Route, scope: string) {
  if (scope !== state.scope)
    return RAIL_ORDER.indexOf(scope) > RAIL_ORDER.indexOf(state.scope)
      ? "up"
      : "down"
  const wasSettings = state.route.page === "settings"
  const isSettings = route.page === "settings"
  if (isSettings && !wasSettings) return "forward"
  if (wasSettings && !isSettings) return "back"
  return "none"
}

export default function Overview() {
  const [state, setState] = useState(INITIAL)
  const actions: Actions = {
    state,
    go: (route, scope) =>
      setState({
        ...state,
        scope: scope ?? state.scope,
        route,
        landed: null,
        transition: panelTransition(state, route, scope ?? state.scope)
      }),
    reorder: (slug, keys) => {
      const pins = state.pins[slug] ?? []
      const byKey = new Map(pins.map((pin) => [pinKey(slug, pin), pin]))
      setState({
        ...state,
        pins: {
          ...state.pins,
          // Sub-tickets nested under a parent aren't sorted on their own;
          // they keep their place after the rows that were.
          [slug]: [
            ...keys.flatMap((key) => {
              const pin = byKey.get(key)
              return pin ? [pin] : []
            }),
            ...pins.filter((pin) => !keys.includes(pinKey(slug, pin)))
          ]
        },
        landed: null,
        transition: "none"
      })
    },
    togglePin: (slug, pin) => {
      const pins = state.pins[slug] ?? []
      const pinned = pins.some((p) => samePin(p, pin))
      setState({
        ...state,
        pins: {
          ...state.pins,
          [slug]: pinned ? pins.filter((p) => !samePin(p, pin)) : [pin, ...pins]
        },
        landed: pinned ? null : pinKey(slug, pin),
        transition: "none"
      })
    }
  }
  const project = PROJECTS.find((p) => p.slug === state.scope)
  return (
    <div className="@container w-full">
      <div className="grid h-[580px] grid-cols-[auto_minmax(0,1fr)] overflow-hidden rounded-[14px] bg-background text-foreground shadow-[var(--shadow-1)]">
        <div className="flex min-h-0">
          <Rail actions={actions} />
          <SidebarPanel
            panelKey={`${state.scope}:${state.route.page === "settings" ? "settings" : "main"}`}
            transition={state.transition}
            header={
              state.route.page === "settings" ? undefined : (
                <PanelHeader project={project} />
              )
            }
          >
            {project === undefined ? (
              <DashboardPanel actions={actions} />
            ) : state.route.page === "settings" ? (
              <SettingsPanel
                projectName={project.name}
                section={state.route.id}
                onBack={() => actions.go({ page: "backlog" })}
                onPick={(id) => actions.go({ page: "settings", id })}
              />
            ) : (
              <ProjectPanel actions={actions} project={project} />
            )}
          </SidebarPanel>
        </div>
        <div className="m-2 ml-0 hidden min-w-0 overflow-auto rounded-[12px] bg-page px-6 pt-3 pb-6 shadow-[var(--shadow-1)] @2xl:block">
          <PageView scope={state.scope} route={state.route} go={actions.go} />
        </div>
      </div>
    </div>
  )
}
