import { ChipSeparator, chipClassName } from "@pp/ui/chip"
import {
  ChevronRight,
  CircleCheck,
  CircleDashed,
  CircleDot,
  Flag,
  Gauge,
  GitPullRequest,
  Layers,
  PriorityHigh,
  PriorityLow,
  PriorityMedium,
  User
} from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"
import { MemberAvatar } from "@pp/ui/member-avatar"
import { Popover, PopoverContent, PopoverTrigger } from "@pp/ui/popover"
import { StatusGlyph } from "@pp/ui/status-glyph"

import { RelationChip, SubTicketCount } from "./previews"

/*
 * Stand-ins for the app's ticket fields, for the list and board demos. The
 * app's own fields are menus with their data; these only look like them.
 */

export type Status = "todo" | "progress" | "review" | "done"
export type Priority = "urgent" | "medium" | "low"

export type SampleTicket = Readonly<{
  id: string
  title: string
  status: Status
  priority: Priority
  parent?: string
  tags?: ReadonlyArray<Readonly<{ name: string; color: string }>>
  subTickets?: Readonly<{ done: number; total: number }>
  links?: number
  pr?: string
  estimate?: number
  assignee?: Readonly<{ id: string; name: string }>
  flagged?: boolean
  epic?: string
}>

export const INVITED: SampleTicket = {
  id: "ATL-10",
  title: "Skip onboarding for invited users",
  status: "todo",
  priority: "medium",
  tags: [{ name: "onboarding", color: "oklch(0.7 0.15 150)" }],
  estimate: 3,
  assignee: { id: "u1", name: "Wouter Missler" }
}

export const AUDIT: SampleTicket = {
  id: "ATL-22",
  title: "Accessibility audit of checklist screens",
  status: "progress",
  priority: "urgent",
  subTickets: { done: 1, total: 3 },
  links: 2,
  estimate: 5
}

export const FOCUS: SampleTicket = {
  id: "ATL-24",
  title: "Announce focus changes to screen readers",
  status: "review",
  priority: "low",
  parent: "Accessibility audit of checklist screens",
  pr: "#128",
  estimate: 2,
  assignee: { id: "u2", name: "Sam Rivera" }
}

export const CRASH: SampleTicket = {
  id: "ATL-17",
  title: "Crash when opening a job with no address on older Android devices",
  status: "done",
  priority: "urgent",
  tags: [
    { name: "crash", color: "oklch(0.65 0.2 25)" },
    { name: "android", color: "oklch(0.72 0.15 140)" }
  ],
  estimate: 1,
  assignee: { id: "u1", name: "Wouter Missler" }
}

// A ticket with every property set, to see a full card and row.
export const EVERYTHING: SampleTicket = {
  id: "ATL-31",
  title: "Offline checklist sync drops edits made during a reconnect",
  status: "progress",
  priority: "urgent",
  parent: "Offline mode",
  epic: "Field reliability",
  flagged: true,
  subTickets: { done: 2, total: 5 },
  links: 3,
  pr: "#141",
  estimate: 8,
  assignee: { id: "u2", name: "Sam Rivera" },
  tags: [
    { name: "offline", color: "oklch(0.7 0.13 250)" },
    { name: "sync", color: "oklch(0.72 0.14 190)" },
    { name: "data loss", color: "oklch(0.65 0.2 25)" },
    { name: "android", color: "oklch(0.72 0.15 140)" },
    { name: "ios", color: "oklch(0.7 0.02 260)" }
  ]
}

export const TICKETS: ReadonlyArray<SampleTicket> = [
  INVITED,
  AUDIT,
  FOCUS,
  CRASH
]

const STATUS = {
  todo: {
    icon: CircleDashed,
    label: "Todo",
    className: "text-muted-foreground"
  },
  progress: {
    icon: CircleDot,
    label: "In progress",
    className: "text-sky-600"
  },
  review: { icon: CircleDot, label: "In review", className: "text-violet-600" },
  done: { icon: CircleCheck, label: "Done", className: "text-emerald-600" }
} as const

const PRIORITY = {
  urgent: { icon: PriorityHigh, label: "High", className: "text-state-danger" },
  medium: {
    icon: PriorityMedium,
    label: "Medium",
    className: "text-state-warning"
  },
  low: { icon: PriorityLow, label: "Low", className: "text-muted-foreground" }
} as const

const fieldButton =
  "grid size-6 cursor-pointer place-items-center rounded-md transition-colors hover:bg-hover disabled:cursor-not-allowed"

export function StatusField({ status }: Readonly<{ status: Status }>) {
  const { icon: Icon, label, className } = STATUS[status]
  return (
    <button
      type="button"
      aria-label={`Status: ${label}`}
      className={fieldButton}
    >
      <Icon className={cn("size-4", className)} strokeWidth={1.75} />
    </button>
  )
}

export function PriorityField({ priority }: Readonly<{ priority: Priority }>) {
  const { icon: Icon, label, className } = PRIORITY[priority]
  return (
    <button
      type="button"
      aria-label={`Priority: ${label}`}
      className={fieldButton}
    >
      <Icon className={cn("size-3.5", className)} strokeWidth={1.75} />
    </button>
  )
}

export function PriorityChip({ priority }: Readonly<{ priority: Priority }>) {
  const { icon: Icon, label, className } = PRIORITY[priority]
  return (
    <button
      type="button"
      aria-label={`Priority: ${label}`}
      className={chipClassName({ interaction: "press", shape: "icon" })}
    >
      <Icon className={cn("size-3", className)} strokeWidth={1.75} />
    </button>
  )
}

export function AssigneeField({
  assignee,
  size = 24
}: Readonly<{ assignee?: SampleTicket["assignee"]; size?: number }>) {
  return (
    <button
      type="button"
      aria-label={assignee ? `Assignee: ${assignee.name}` : "Assign"}
      className="grid min-h-6 min-w-6 cursor-pointer place-items-center rounded-full"
    >
      {assignee ? (
        <MemberAvatar member={assignee} size={size} />
      ) : (
        <span
          // Like the app: the empty face waits for the row's or card's hover.
          className="grid place-items-center rounded-full text-muted-foreground opacity-0 shadow-[inset_0_0_0_1px_var(--border)] transition-opacity duration-150 group-hover/card:opacity-100 group-hover/reveal:opacity-100 group-has-[:focus-visible]/card:opacity-100 group-has-[:focus-visible]/reveal:opacity-100 group-data-[force~=hover]/card:opacity-100 group-data-[force~=hover]/reveal:opacity-100"
          style={{ width: size, height: size }}
        >
          <User className="size-3.5" strokeWidth={1.75} />
        </span>
      )}
    </button>
  )
}

function TagDot({ color }: Readonly<{ color: string }>) {
  return (
    <span
      aria-hidden
      className="size-2 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  )
}

// Tags, the first `max` as chips and the rest behind a "+N" chip that lists
// them on hover, like the app's tag preview.
export function TagChips({
  ticket,
  max
}: Readonly<{ ticket: SampleTicket; max?: number }>) {
  const tags = ticket.tags ?? []
  const shown = max === undefined ? tags : tags.slice(0, max)
  const hidden = tags.slice(shown.length)
  return (
    <>
      {shown.map((tag) => (
        <button
          key={tag.name}
          type="button"
          className={chipClassName({ kind: "label", interaction: "press" })}
        >
          <TagDot color={tag.color} />
          <span className="truncate">{tag.name}</span>
        </button>
      ))}
      {hidden.length > 0 ? (
        <Popover>
          <PopoverTrigger
            openOnHover
            delay={300}
            aria-label={`${hidden.length} more tags`}
            className={chipClassName({
              kind: "label",
              interaction: "press",
              className: "tabular-nums"
            })}
          >
            +{hidden.length}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-48 p-1">
            <ul className="flex flex-col">
              {hidden.map((tag) => (
                <li
                  key={tag.name}
                  className="flex min-w-0 items-center gap-2 px-2 py-1.5 text-body"
                >
                  <TagDot color={tag.color} />
                  <span className="min-w-0 truncate">{tag.name}</span>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      ) : null}
    </>
  )
}

export function FlagChip({ flagged }: Readonly<{ flagged?: boolean }>) {
  if (!flagged) return null
  return (
    <span
      className={chipClassName({
        interaction: "hover",
        shape: "icon",
        className: "[&_svg]:size-3"
      })}
    >
      <Flag aria-hidden className="text-state-warning" strokeWidth={1.75} />
      <span className="sr-only">Flagged</span>
    </span>
  )
}

export function EpicChip({ epic }: Readonly<{ epic?: string }>) {
  if (!epic) return null
  return (
    <a
      href="#epic"
      onClick={(event) => event.preventDefault()}
      className={chipClassName({ kind: "label", interaction: "press" })}
    >
      <Layers className="size-3 shrink-0" strokeWidth={1.75} />
      <span className="truncate">{epic}</span>
    </a>
  )
}

// A card's chips in the one order and language every card uses: the state
// icons (priority, flag), a hairline, the numbers as icon and value
// (estimate, progress, links, git), then the names as label pills (epic,
// tags, +N), which wrap last.
export function CardProperties({ ticket }: Readonly<{ ticket: SampleTicket }>) {
  return (
    <>
      <PriorityChip priority={ticket.priority} />
      <FlagChip flagged={ticket.flagged} />
      <ChipSeparator />
      <EstimateChip estimate={ticket.estimate} />
      <SubTicketCount ticket={ticket} />
      <RelationChip count={ticket.links} />
      <GitChip pr={ticket.pr} />
      <EpicChip epic={ticket.epic} />
      <TagChips ticket={ticket} max={2} />
    </>
  )
}

export { RelationChip, SubTicketCount }

export function GitChip({ pr }: Readonly<{ pr?: string }>) {
  if (!pr) return null
  return (
    <button type="button" className={chipClassName({ interaction: "press" })}>
      <GitPullRequest className="size-3 shrink-0" strokeWidth={1.75} />
      {pr}
    </button>
  )
}

export function EstimateChip({ estimate }: Readonly<{ estimate?: number }>) {
  if (estimate === undefined) return null
  return (
    <button
      type="button"
      aria-label={estimate === 1 ? "1 point" : `${estimate} points`}
      className={chipClassName({
        interaction: "press",
        className: "tabular-nums"
      })}
    >
      <Gauge className="size-3" strokeWidth={1.75} />
      {estimate}
    </button>
  )
}

// The list's parent prefix: the parent's title, then a slash.
export function ParentPrefix({ title }: Readonly<{ title: string }>) {
  return (
    <span className="flex min-w-0 shrink items-center gap-1.5 pr-1.5 text-body text-muted-foreground">
      <span className="max-w-48 truncate">{title}</span>
      <span aria-hidden>/</span>
    </span>
  )
}

// The card's parent crumb: a chevron, then the parent's title.
export function ParentCrumb({ title }: Readonly<{ title: string }>) {
  return (
    <>
      <ChevronRight
        aria-hidden
        className="-mx-0.5 size-3.5 shrink-0 self-center"
        strokeWidth={1.75}
      />
      <span className="min-w-0 truncate">{title}</span>
    </>
  )
}

// A status's glyph, as section headers and board columns show it.
export function StatusIcon({ status }: Readonly<{ status: Status }>) {
  const { icon, className } = STATUS[status]
  return <StatusGlyph icon={icon} className={className} />
}
