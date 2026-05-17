import { ChevronDown, ChevronUp, Minus, type LucideIcon } from "lucide-react"
import type { TicketPriority } from "@projectproject/shared"
import type { BadgeTone } from "@/components/ui/badge"
import { m } from "@/paraglide/messages"

export const PRIORITY_META: Record<
  TicketPriority,
  {
    label: string
    icon: LucideIcon
    className: string
    tone: BadgeTone
    ordinal: number
  }
> = {
  low: {
    label: "Low",
    icon: ChevronDown,
    className: "text-muted-foreground",
    tone: "muted",
    ordinal: 0
  },
  med: {
    label: "Med",
    icon: Minus,
    className: "text-state-warning",
    tone: "amber",
    ordinal: 1
  },
  high: {
    label: "High",
    icon: ChevronUp,
    className: "text-state-danger",
    tone: "red",
    ordinal: 2
  }
}

export const PRIORITY_ORDER: ReadonlyArray<TicketPriority> = [
  "high",
  "med",
  "low"
]

export const PRIORITY_LABELS: Record<TicketPriority, () => string> = {
  low: () => m.tickets_priority_low(),
  med: () => m.tickets_priority_med(),
  high: () => m.tickets_priority_high()
}
