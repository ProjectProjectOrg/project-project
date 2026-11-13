import type { TicketId, TicketSequence, TicketSequenceEntry } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import { ChevronDown, ChevronUp } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { TicketPreviewTrigger } from "@/features/tickets/components/ticket-preview/TicketPreview"
import {
  NEXT_KEY,
  PREVIOUS_KEY
} from "@/features/tickets/hooks/useTicketStepping"
import type { TicketDetailSearch } from "@/features/tickets/lib/ticketSearch"
import type { IconComponent } from "@/lib/icon"
import { m } from "@/paraglide/messages"

type Step = Readonly<{
  neighbor: TicketSequenceEntry | null
  shortcut: string
  icon: IconComponent
  label: string
}>

const positionLabel: Record<
  TicketSequence["within"],
  (input: Readonly<{ position: number; total: number }>) => string
> = {
  view: m.tickets_stepper_position,
  epic: m.tickets_stepper_epic_position,
  parent: m.tickets_stepper_sub_ticket_position
}

export function TicketStepper({
  sequence,
  shown,
  search
}: Readonly<{
  sequence: TicketSequence
  shown: TicketId
  search: TicketDetailSearch
}>) {
  const { tickets, within } = sequence
  const index = tickets.findIndex((ticket) => ticket.id === shown)
  if (index === -1) return null
  const total = tickets.length
  const label = positionLabel[within]
  const step = (step: Step) => <StepButton {...step} search={search} />
  return (
    <div className="flex items-center gap-0.5">
      <span
        className="pr-1.5 text-right font-mono text-caption whitespace-nowrap text-muted-foreground tabular-nums"
        style={{ minWidth: `${label({ position: total, total }).length}ch` }}
      >
        {label({ position: index + 1, total })}
      </span>
      {step({
        neighbor: tickets[index - 1] ?? null,
        shortcut: PREVIOUS_KEY,
        icon: ChevronUp,
        label: m.tickets_stepper_previous()
      })}
      {step({
        neighbor: tickets[index + 1] ?? null,
        shortcut: NEXT_KEY,
        icon: ChevronDown,
        label: m.tickets_stepper_next()
      })}
    </div>
  )
}

function StepButton({
  neighbor,
  shortcut,
  icon: Icon,
  label,
  search
}: Step & Readonly<{ search: TicketDetailSearch }>) {
  const { orgSlug, slug } = useProjectRoute()
  const icon = <Icon strokeWidth={1.75} />
  if (neighbor === null) {
    return (
      <Button variant="ghost" size="icon-sm" aria-label={label} disabled>
        {icon}
      </Button>
    )
  }
  return (
    <TicketPreviewTrigger
      preview={{ kind: "ticket", id: neighbor.id, shortcut }}
      render={
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          aria-keyshortcuts={shortcut}
          render={
            <Link
              to="/orgs/$orgSlug/projects/$slug/tickets/$id"
              params={{ orgSlug, slug, id: neighbor.id }}
              search={search}
              replace
              state={{ ticketStep: true }}
            />
          }
        />
      }
    >
      {icon}
    </TicketPreviewTrigger>
  )
}
