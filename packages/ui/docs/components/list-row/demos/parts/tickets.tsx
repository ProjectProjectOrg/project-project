import { chipClassName } from "@pp/ui/chip"
import {
  ChevronRight,
  CircleCheck,
  CircleDashed,
  CircleDot,
  GitPullRequest,
  Link2,
  PriorityHigh,
  PriorityLow,
  PriorityMedium,
  User
} from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"
import { MemberAvatar } from "@pp/ui/member-avatar"
import { ProgressCount } from "@pp/ui/progress-count"
import { StatusGlyph } from "@pp/ui/status-glyph"

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
          className="grid place-items-center rounded-full bg-muted text-muted-foreground"
          style={{ width: size, height: size }}
        >
          <User className="size-3.5" strokeWidth={1.75} />
        </span>
      )}
    </button>
  )
}

export function TagChips({ ticket }: Readonly<{ ticket: SampleTicket }>) {
  return (
    <>
      {(ticket.tags ?? []).map((tag) => (
        <button
          key={tag.name}
          type="button"
          className={chipClassName({ interaction: "press" })}
        >
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: tag.color }}
          />
          <span className="truncate">{tag.name}</span>
        </button>
      ))}
    </>
  )
}

export function RelationChip({ count }: Readonly<{ count?: number }>) {
  if (!count) return null
  return (
    <span
      aria-label={`${count} linked tickets`}
      className={chipClassName({ interaction: "hover", shape: "count" })}
    >
      <Link2 strokeWidth={1.75} />
      <span className="tabular-nums">{count}</span>
    </span>
  )
}

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
    <button type="button" className={chipClassName({ interaction: "press" })}>
      {estimate === 1 ? "1 point" : `${estimate} points`}
    </button>
  )
}

export function SubTicketCount({ ticket }: Readonly<{ ticket: SampleTicket }>) {
  if (!ticket.subTickets) return null
  const { done, total } = ticket.subTickets
  return (
    <ProgressCount
      done={done}
      total={total}
      label={`${done} of ${total} sub-tickets done`}
    />
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
