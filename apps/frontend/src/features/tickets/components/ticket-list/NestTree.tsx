import type { Ticket } from "@pp/shared"
import { ChevronDown, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { SubTicketProgress } from "./SubTicketProgress"

export type RowNest =
  | Readonly<{ role: "parent"; expanded: boolean; onToggle: () => void }>
  | Readonly<{ role: "child"; last: boolean }>

const LINE =
  "border-[color-mix(in_oklab,var(--muted-foreground)_45%,var(--background))]"

export const nestIndent = (nest: RowNest | undefined) =>
  nest?.role === "child" ? "translate-x-6" : undefined

export const nestTitleIndent = (nest: RowNest | undefined) =>
  nest?.role === "child" ? "pl-[30px]" : "pl-1.5"

export function NestTree({ nest }: Readonly<{ nest: RowNest | undefined }>) {
  if (nest === undefined) return null
  if (nest.role === "child") {
    return (
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-10"
      >
        {!nest.last && (
          <span
            className={cn("absolute -top-2 -bottom-2 left-7 border-l", LINE)}
          />
        )}
        <span
          className={cn(
            "absolute -top-2 bottom-1/2 left-7 w-3 rounded-bl-[6px] border-b border-l",
            LINE
          )}
        />
      </span>
    )
  }
  if (!nest.expanded) return null
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute top-[calc(50%+10px)] -bottom-2 left-7 border-l",
        LINE
      )}
    />
  )
}

export function NestToggle({
  expanded,
  onToggle
}: Readonly<{ expanded: boolean; onToggle: () => void }>) {
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-label={
        expanded
          ? m.tickets_sub_tickets_collapse()
          : m.tickets_sub_tickets_expand()
      }
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onToggle()
      }}
      className="grid size-5 place-items-center rounded-md text-muted-foreground transition-[color,background-color] duration-100 hover:bg-hover hover:text-foreground"
    >
      <ChevronRight
        aria-hidden
        className={cn(
          "size-3.5 transition-transform duration-150",
          expanded && "rotate-90"
        )}
        strokeWidth={1.75}
      />
    </button>
  )
}

export function NestProgressToggle({
  ticket,
  expanded,
  onToggle
}: Readonly<{
  ticket: Pick<Ticket, "subTicketCount" | "subTicketDoneCount">
  expanded: boolean
  onToggle: () => void
}>) {
  const progress = {
    done: ticket.subTicketDoneCount ?? 0,
    total: ticket.subTicketCount ?? 0
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      trailingIcon={expanded ? ChevronDown : ChevronRight}
      aria-expanded={expanded}
      aria-label={
        expanded
          ? m.tickets_sub_tickets_collapse_progress(progress)
          : m.tickets_sub_tickets_expand_progress(progress)
      }
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onToggle()
      }}
      className="ml-1 shrink-0"
    >
      <SubTicketProgress ticket={ticket} className="text-inherit" />
    </Button>
  )
}
