import type { TicketPriority } from "@pp/shared"
import type { BadgeTone } from "@pp/ui/badge"
import {
  PriorityHigh,
  PriorityLow,
  PriorityMedium,
  type IconType
} from "@pp/ui/icons"

import { m } from "@/paraglide/messages"

export const PRIORITY_META: Record<
  TicketPriority,
  {
    label: string
    icon: IconType
    className: string
    tone: BadgeTone
    ordinal: number
  }
> = {
  low: {
    label: "Low",
    icon: PriorityLow,
    className: "text-muted-foreground",
    tone: "muted",
    ordinal: 0
  },
  med: {
    label: "Med",
    icon: PriorityMedium,
    className: "text-state-warning",
    tone: "amber",
    ordinal: 1
  },
  high: {
    label: "High",
    icon: PriorityHigh,
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
