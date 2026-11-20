import { Chip, type ChipShape } from "@pp/ui/chip"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger
} from "@pp/ui/hover-card"
import { Link2 } from "@pp/ui/icons"
import { ProgressCount } from "@pp/ui/progress-count"
import { TicketLine, TicketLines, TicketLinesLabel } from "@pp/ui/ticket-lines"
import { Fragment, type ReactNode } from "react"

import { StatusIcon, type SampleTicket, type Status } from "./tickets"

/*
 * The chips that preview on hover in the demos (links and progress), like
 * the app's TicketPreviewTrigger.
 */

// A chip that previews on hover, like the app's TicketPreviewTrigger: the
// hover fill, and a hover card after a short delay.
function PreviewChip({
  label,
  shape,
  trigger,
  children
}: Readonly<{
  label: string
  shape?: ChipShape
  trigger: ReactNode
  children: ReactNode
}>) {
  return (
    <HoverCard>
      <HoverCardTrigger
        render={<Chip interaction="hover" shape={shape} aria-label={label} />}
      >
        {trigger}
      </HoverCardTrigger>
      <HoverCardContent className="w-72 p-1">{children}</HoverCardContent>
    </HoverCard>
  )
}

// A previewed ticket: a TicketLine, the same menu row the card lists its
// sub-tickets with.
function PreviewLine({
  status,
  id,
  title
}: Readonly<{ status: Status; id: string; title: string }>) {
  return (
    <TicketLine
      status={<StatusIcon status={status} />}
      ticketKey={id}
      title={title}
      href={`#${id}`}
      onClick={(event) => event.preventDefault()}
    />
  )
}

const LINKED = [
  {
    group: "Blocked by",
    status: "progress",
    id: "ATL-12",
    title: "Lazy-load the settings module"
  },
  {
    group: "Blocking",
    status: "todo",
    id: "ATL-19",
    title: "Haptic feedback on checklist completion"
  },
  {
    group: "Related",
    status: "done",
    id: "ATL-8",
    title: "Redesign welcome screens"
  }
] as const

export function RelationChip({ count }: Readonly<{ count?: number }>) {
  if (!count) return null
  const shown = LINKED.slice(0, count)
  return (
    <PreviewChip
      label={`${count} linked tickets`}
      shape="count"
      trigger={
        <>
          <Link2 strokeWidth={1.75} />
          <span className="tabular-nums">{count}</span>
        </>
      }
    >
      <TicketLines>
        {shown.map((link) => (
          <Fragment key={link.id}>
            <TicketLinesLabel>{link.group}</TicketLinesLabel>
            <PreviewLine status={link.status} id={link.id} title={link.title} />
          </Fragment>
        ))}
      </TicketLines>
    </PreviewChip>
  )
}

const SUBS = [
  {
    status: "done",
    id: "ATL-24",
    title: "Announce focus changes to screen readers"
  },
  { status: "done", id: "ATL-25", title: "Contrast of disabled fields" },
  {
    status: "progress",
    id: "ATL-26",
    title: "Larger tap targets on checklist steps"
  },
  { status: "todo", id: "ATL-27", title: "Label the photo buttons" },
  { status: "todo", id: "ATL-28", title: "Read out step progress" }
] as const

export function SubTicketCount({ ticket }: Readonly<{ ticket: SampleTicket }>) {
  if (!ticket.subTickets) return null
  const { done, total } = ticket.subTickets
  const label = `${done}/${total} sub-tickets done`
  return (
    <PreviewChip
      label={label}
      trigger={
        <ProgressCount done={done} total={total} className="text-inherit" />
      }
    >
      <TicketLines>
        <TicketLinesLabel>{label}</TicketLinesLabel>
        {SUBS.slice(0, total).map((sub) => (
          <PreviewLine
            key={sub.id}
            status={sub.status}
            id={sub.id}
            title={sub.title}
          />
        ))}
      </TicketLines>
    </PreviewChip>
  )
}
