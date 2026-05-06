import { ChevronDown, ChevronUp, Minus, type LucideIcon } from "lucide-react"
import type { TicketPriority } from "@projectproject/shared"
import type { BadgeTone } from "@/components/ui/badge"

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
    className: "text-amber-500",
    tone: "amber",
    ordinal: 1
  },
  high: {
    label: "High",
    icon: ChevronUp,
    className: "text-red-500",
    tone: "red",
    ordinal: 2
  }
}

export const PRIORITY_ORDER: ReadonlyArray<TicketPriority> = [
  "high",
  "med",
  "low"
]
