import { Checkbox } from "@pp/ui/checkbox"
import { Chip } from "@pp/ui/chip"
import {
  CalendarRange,
  CircleCheck,
  CircleDashed,
  CircleDot,
  Gauge,
  GitPullRequest,
  Info,
  LayoutDashboard,
  ListChecks,
  Plus,
  PriorityHigh,
  PriorityLow,
  PriorityMedium,
  Search,
  Settings,
  Zap,
  type IconType
} from "@pp/ui/icons"
import { ListRow, ListRowTitle, listGridClassName } from "@pp/ui/list-row"
import { ListSectionBody, ListSectionHeader } from "@pp/ui/list-section"
import { Logo } from "@pp/ui/logo"
import { MemberAvatar } from "@pp/ui/member-avatar"
import { ProjectIcon, projectIconRadius } from "@pp/ui/project-icon"
import {
  SidebarPanel,
  SidebarPanelBody,
  SidebarPanelHeader,
  SidebarRail,
  SidebarRailItem,
  SidebarRailSeparator,
  SidebarRow,
  SidebarSection,
  SidebarSubRows
} from "@pp/ui/sidebar"
import { StatusGlyph } from "@pp/ui/status-glyph"
import { TicketKey } from "@pp/ui/ticket-key"
import type { CSSProperties, ReactNode } from "react"

import { ease, mix } from "./motion"

/*
 * The app's window, for clips that show the app itself: the rail, a
 * project's panel and its backlog, built from the design system's own
 * sidebar, list and chip components with the theme's tokens. Everything in
 * it arrives by the frame it is given; a clip that wants it settled passes
 * SETTLED.
 */

export const APP_ZOOM = 1.24
export const SETTLED = 10_000

// The rail places its active bar in measured (zoomed) pixels, so the bar
// undoes the zoom and keeps its drawn size.
const RAIL_BAR = `[data-app-window] [data-slot="sidebar-rail-bar"] { zoom: ${1 / APP_ZOOM}; width: ${3 * APP_ZOOM}px; height: ${20 * APP_ZOOM}px; border-radius: 0 ${3 * APP_ZOOM}px ${3 * APP_ZOOM}px 0; }`

// When the window's parts start arriving.
const ROWS_IN = 12

type Status = "todo" | "progress" | "done"
type Priority = "high" | "medium" | "low"

const STATUS: Readonly<Record<Status, readonly [IconType, string]>> = {
  todo: [CircleDashed, "text-muted-foreground"],
  progress: [CircleDot, "text-state-info"],
  done: [CircleCheck, "text-state-success"]
}

const PRIORITY: Readonly<Record<Priority, readonly [IconType, string]>> = {
  high: [PriorityHigh, "text-state-danger"],
  medium: [PriorityMedium, "text-state-warning"],
  low: [PriorityLow, "text-muted-foreground"]
}

type Ticket = Readonly<{
  id: string
  title: string
  priority: Priority
  tag?: readonly [name: string, color: string]
  pr?: string
  estimate: number
  assignee: Readonly<{ id: string; name: string }>
}>

const ADA = { id: "orb-ada", name: "Ada Jansen" }
const SAM = { id: "orb-grace", name: "Sam Rivera" }
const LIN = { id: "orb-linus", name: "Lin Okafor" }

const IN_PROGRESS: ReadonlyArray<Ticket> = [
  {
    id: "ATL-22",
    title: "Accessibility audit of checklist screens",
    priority: "high",
    tag: ["a11y", "oklch(0.7 0.13 250)"],
    estimate: 5,
    assignee: ADA
  },
  {
    id: "ATL-24",
    title: "Announce focus changes to screen readers",
    priority: "medium",
    pr: "#128",
    estimate: 2,
    assignee: SAM
  },
  {
    id: "ATL-31",
    title: "Offline checklist sync keeps edits made while reconnecting",
    priority: "high",
    tag: ["offline", "oklch(0.72 0.14 190)"],
    pr: "#141",
    estimate: 8,
    assignee: LIN
  },
  {
    id: "ATL-17",
    title: "Open jobs that have no address",
    priority: "low",
    tag: ["android", "oklch(0.72 0.15 140)"],
    estimate: 1,
    assignee: ADA
  }
]

const TODO: ReadonlyArray<Ticket> = [
  {
    id: "ATL-10",
    title: "Skip onboarding for invited users",
    priority: "medium",
    tag: ["onboarding", "oklch(0.7 0.15 150)"],
    estimate: 3,
    assignee: SAM
  },
  {
    id: "ATL-35",
    title: "Remember the last used checklist filter",
    priority: "low",
    estimate: 2,
    assignee: LIN
  }
]

const PROJECTS = [
  { seed: "atl", color: "#2a8be0", icon: "🧭", name: "Atlas Mobile App" },
  { seed: "bil", color: "#e0602a", icon: "🧾", name: "Billing" },
  { seed: "web", color: "#4caf50", icon: "🌿", name: "Website" }
] as const

const RAIL_TILE = 34
const ROW_PITCH = 44

// Arriving: a short rise out of nothing, on the app's ease.
const arrive = (frame: number, at: number, length = 16) => {
  const t = ease(frame, at, at + length)
  return {
    opacity: t,
    translate: `0 ${mix(t, 8, 0)}px`
  } satisfies CSSProperties
}

// A status's glyph, as section headers and rows show it.
function StatusIcon({ status }: Readonly<{ status: Status }>) {
  // oxlint-disable-next-line shadcn/require-static-classes -- one static class per status, in STATUS above
  const [icon, className] = STATUS[status]
  return <StatusGlyph icon={icon} className={className} />
}

function StatusMark({ status }: Readonly<{ status: Status }>) {
  return (
    <span className="grid size-6 place-items-center">
      <StatusIcon status={status} />
    </span>
  )
}

function Row({
  ticket,
  status,
  hovered,
  selected,
  style
}: Readonly<{
  ticket: Ticket
  status: Status
  hovered: number
  selected: boolean
  style: CSSProperties
}>) {
  const [PriorityIcon, priorityClass] = PRIORITY[ticket.priority]
  return (
    <ListRow
      style={style}
      selected={selected}
      lead={
        <span style={{ opacity: selected ? 1 : hovered }} className="flex">
          <Checkbox
            checked={selected}
            aria-label={`Select ${ticket.id}`}
            variant="quiet"
            tabIndex={-1}
          />
        </span>
      }
      status={<StatusMark status={status} />}
      priority={
        <span className="grid size-6 place-items-center">
          <PriorityIcon
            className={`size-3.5 ${priorityClass}`}
            strokeWidth={1.75}
          />
        </span>
      }
      ticketKey={
        <TicketKey value={ticket.id} className="min-w-(--ticket-key-width)" />
      }
      title={<ListRowTitle>{ticket.title}</ListRowTitle>}
      trailing={
        <>
          {ticket.tag === undefined ? null : (
            <Chip kind="label">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: ticket.tag[1] }}
              />
              <span className="truncate">{ticket.tag[0]}</span>
            </Chip>
          )}
          {ticket.pr === undefined ? null : (
            <Chip>
              <GitPullRequest className="size-3 shrink-0" strokeWidth={1.75} />
              {ticket.pr}
            </Chip>
          )}
        </>
      }
      estimate={
        <Chip className="tabular-nums">
          <Gauge className="size-3" strokeWidth={1.75} />
          {ticket.estimate}
        </Chip>
      }
      assignee={
        <span className="grid min-h-6 min-w-6 place-items-center">
          <MemberAvatar member={ticket.assignee} size={20} />
        </span>
      }
    />
  )
}

const noop = () => undefined

function Section({
  frame,
  at,
  status,
  label,
  tickets,
  hover,
  ticked
}: Readonly<{
  frame: number
  at: number
  status: Status
  label: string
  tickets: ReadonlyArray<Ticket>
  // Which row the gliding hover is on (fractional while it moves), and how
  // visible it is.
  hover?: Readonly<{ row: number; shown: number }>
  ticked?: number
}>) {
  return (
    <div className="flex flex-col">
      <div style={arrive(frame, at)}>
        <ListSectionHeader
          icon={<StatusIcon status={status} />}
          label={label}
          count={tickets.length}
          countLabel={`${tickets.length} tickets`}
          collapsed={false}
          onToggleCollapsed={noop}
          collapseLabel={`Collapse ${label}`}
          create={{
            creating: false,
            creator: null,
            onStart: noop,
            onDismiss: noop,
            label: "New ticket",
            dismissLabel: "Cancel"
          }}
        />
      </div>
      <ListSectionBody collapsed={false}>
        <div className={`${listGridClassName} relative`}>
          {hover === undefined ? null : (
            // The list's gliding hover (ListHoverScope's highlight), placed
            // by the frame.
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-10 rounded-[20px] bg-hover-overlay [corner-shape:var(--button-corner)]"
              style={{
                opacity: hover.shown,
                translate: `0 ${hover.row * ROW_PITCH}px`
              }}
            />
          )}
          {tickets.map((ticket, index) => (
            <Row
              key={ticket.id}
              ticket={ticket}
              status={status}
              hovered={
                hover === undefined
                  ? 0
                  : hover.shown *
                    Math.max(0, 1 - Math.abs(hover.row - index) * 2)
              }
              selected={ticked === index}
              style={arrive(frame, at + 4 + index * 4)}
            />
          ))}
        </div>
      </ListSectionBody>
    </div>
  )
}

export type AppHover = Readonly<{ row: number; shown: number }>

export function AppWindow({
  frame,
  hover,
  ticked,
  footer,
  style
}: Readonly<{
  frame: number
  // The list's gliding hover over the first section's rows.
  hover?: AppHover
  // The row of the first section that is ticked.
  ticked?: number
  // Under the panel's rows: the What's new card.
  footer?: ReactNode
  style?: CSSProperties
}>) {
  const side = (index: number) => arrive(frame, ROWS_IN + index * 3)
  return (
    <>
      <style>{RAIL_BAR}</style>
      <div
        data-app-window=""
        className="grid h-[478px] w-[928px] grid-cols-[auto_minmax(0,1fr)] overflow-hidden rounded-[18px] surface-background text-left text-foreground shadow-(--tooltip-edge) [corner-shape:var(--button-corner)]"
        style={{ zoom: APP_ZOOM, "--ticket-key-width": "6ch", ...style }}
      >
        <div className="flex min-h-0">
          <SidebarRail
            label="Projects"
            top={
              <SidebarRailItem label="Switch organization">
                <Logo className="size-[22px]" />
              </SidebarRailItem>
            }
            bottom={
              <>
                <SidebarRailItem label="Search">
                  <Search />
                </SidebarRailItem>
                <SidebarRailItem label={ADA.name}>
                  <MemberAvatar member={ADA} size={28} />
                </SidebarRailItem>
              </>
            }
          >
            <SidebarRailItem label="Dashboard">
              <LayoutDashboard />
            </SidebarRailItem>
            <SidebarRailSeparator />
            {PROJECTS.map((project, index) => (
              <SidebarRailItem
                key={project.seed}
                label={project.name}
                tone={project.color}
                active={index === 0}
                className="corner-squircle"
                style={{
                  borderRadius: projectIconRadius(RAIL_TILE),
                  ...arrive(frame, 6 + index * 4)
                }}
              >
                <ProjectIcon
                  seed={project.seed}
                  color={project.color}
                  icon={project.icon}
                  size={RAIL_TILE}
                />
              </SidebarRailItem>
            ))}
            <SidebarRailItem label="New project">
              <Plus />
            </SidebarRailItem>
          </SidebarRail>
          <SidebarPanel
            panelKey="atl"
            footer={footer}
            header={
              <SidebarPanelHeader
                title="Atlas Mobile App"
                subtitle="Sprint 24 · 6d left"
                subtitleIcon={
                  <Zap
                    aria-hidden
                    strokeWidth={1.75}
                    className="size-3 shrink-0 text-state-info"
                  />
                }
              />
            }
          >
            <SidebarPanelBody label="Atlas Mobile App">
              <SidebarRow
                icon={<ListChecks />}
                label="Backlog"
                active
                style={side(0)}
              />
              <SidebarRow
                icon={<CalendarRange />}
                label="Sprints"
                style={side(1)}
              />
              <SidebarSubRows>
                <SidebarRow label="Current" meta="6d" style={side(2)} />
              </SidebarSubRows>
              <SidebarRow icon={<Info />} label="About" style={side(3)} />
              <SidebarRow
                icon={<Settings />}
                label="Settings"
                submenu
                style={side(4)}
              />
              <SidebarSection label="Pinned" count={2}>
                <SidebarRow
                  icon={
                    <CircleDot
                      aria-hidden
                      strokeWidth={1.75}
                      className="size-3.5 shrink-0 text-state-info"
                    />
                  }
                  label="Accessibility audit of checklist screens"
                  meta={<span className="text-micro tabular-nums">ATL-22</span>}
                  style={side(6)}
                />
                <SidebarSubRows>
                  <SidebarRow
                    icon={
                      <CircleDashed
                        aria-hidden
                        strokeWidth={1.75}
                        className="size-3.5 shrink-0 text-muted-foreground"
                      />
                    }
                    label="Announce focus changes"
                    meta={
                      <span className="text-micro tabular-nums">ATL-24</span>
                    }
                    style={side(7)}
                  />
                </SidebarSubRows>
              </SidebarSection>
            </SidebarPanelBody>
          </SidebarPanel>
        </div>
        <div className="m-2 ml-0 flex min-w-0 flex-col gap-3 overflow-hidden rounded-[12px] surface-page p-3 shadow-(--tooltip-edge) [corner-shape:var(--button-corner)]">
          <Section
            frame={frame}
            at={ROWS_IN + 4}
            status="progress"
            label="In progress"
            tickets={IN_PROGRESS}
            hover={hover}
            ticked={ticked}
          />
          <Section
            frame={frame}
            at={ROWS_IN + 24}
            status="todo"
            label="Todo"
            tickets={TODO}
          />
        </div>
      </div>
    </>
  )
}
