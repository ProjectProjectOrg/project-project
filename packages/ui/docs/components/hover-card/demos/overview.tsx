import { Chip } from "@pp/ui/chip"
import {
  HoverCard,
  HoverCardContent,
  hoverCardSurfaceClass,
  HoverCardTrigger
} from "@pp/ui/hover-card"
import { cn } from "@pp/ui/lib/utils"
import { ProgressCount } from "@pp/ui/progress-count"
import { TicketLine, TicketLines, TicketLinesLabel } from "@pp/ui/ticket-lines"
import type { ReactNode } from "react"

import { StatusIcon } from "../../list-row/demos/parts/tickets"

const SUBS = [
  { status: "done", id: "ATL-236", title: "Detect conflicting edits" },
  {
    status: "progress",
    id: "ATL-237",
    title: "Show both versions side by side"
  },
  { status: "todo", id: "ATL-238", title: "Keep the newer note" }
] as const

function SubTickets() {
  return (
    <TicketLines>
      <TicketLinesLabel>Sub-tickets · 1 of 3 done</TicketLinesLabel>
      {SUBS.map((sub) => (
        <TicketLine
          key={sub.id}
          status={<StatusIcon status={sub.status} />}
          ticketKey={sub.id}
          title={sub.title}
          href={`#${sub.id}`}
          onClick={(event) => event.preventDefault()}
        />
      ))}
    </TicketLines>
  )
}

// The live specimen: a sub-ticket count, three times its size. Rest the
// pointer on it and its card opens after 400ms; move into the card and
// click a row.
function Large() {
  return (
    <div className="flex justify-center py-2">
      <HoverCard>
        <HoverCardTrigger
          render={
            <Chip
              interaction="hover"
              aria-label="1 of 3 sub-tickets done"
              className="[zoom:3]"
            />
          }
        >
          <ProgressCount done={1} total={3} className="text-inherit" />
        </HoverCardTrigger>
        {/* Beside the specimen, so it doesn't cover the cards below. */}
        <HoverCardContent side="right" className="w-72 p-1">
          <SubTickets />
        </HoverCardContent>
      </HoverCard>
    </div>
  )
}

// A card as it looks open, drawn in place: the same surface the popup uses.
function Surface({
  caption,
  className,
  children
}: Readonly<{ caption: string; className: string; children: ReactNode }>) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-3">
      <div className={cn(hoverCardSurfaceClass, "w-full max-w-72", className)}>
        {children}
      </div>
      <span className="text-caption text-muted-foreground">{caption}</span>
    </div>
  )
}

export default function Overview() {
  return (
    <div className="@container flex w-full flex-col gap-20">
      <Large />
      <div className="grid grid-cols-1 items-start gap-x-6 gap-y-8 @2xl:grid-cols-[repeat(3,minmax(0,1fr))]">
        <Surface caption="Menu rows · p-1" className="p-1">
          <SubTickets />
        </Surface>
        <Surface caption="Text · the default" className="px-2.5 py-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-caption text-muted-foreground">
              Flagged by Sam Rivera · 2h ago
            </span>
            <p className="text-body">
              Waiting on the API for revision vectors; don&apos;t start the
              banner yet.
            </p>
          </div>
        </Surface>
        <Surface
          caption="Show only · pointer-events-none"
          className="px-2.5 py-2"
        >
          <div className="flex flex-col gap-1.5">
            <span className="line-clamp-2 text-body leading-snug font-semibold">
              Resolve edit conflicts between two devices
            </span>
            <span className="flex gap-3 text-caption text-muted-foreground tabular-nums">
              <span className="text-state-info">Open</span>
              #141 · fix/ATL-235-conflicts
            </span>
          </div>
        </Surface>
      </div>
    </div>
  )
}
