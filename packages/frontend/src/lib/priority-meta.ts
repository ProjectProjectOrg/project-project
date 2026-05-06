import { ChevronUp, ChevronsUp, Minus, type LucideIcon } from "lucide-react"
import type { TicketPriority } from "@projectproject/shared"
import type { BadgeTone } from "@/components/ui/badge"

export const PRIORITY_META: Record<
  TicketPriority,
  { label: string; icon: LucideIcon; tone: BadgeTone; ordinal: number }
> = {
  low: { label: "Low", icon: Minus, tone: "muted", ordinal: 0 },
  med: { label: "Med", icon: ChevronUp, tone: "amber", ordinal: 1 },
  high: { label: "High", icon: ChevronsUp, tone: "red", ordinal: 2 }
}

export const PRIORITY_ORDER: ReadonlyArray<TicketPriority> = ["low", "med", "high"]
