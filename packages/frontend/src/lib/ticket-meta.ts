import {
  Bug,
  Check,
  CircleDashed,
  CircleDot,
  Hammer,
  HelpCircle,
  Sparkles,
  type LucideIcon
} from "lucide-react"
import type { TicketStatus, TicketType } from "@projectproject/shared"
import type { BadgeTone } from "@/components/ui/badge"

export const STATUS_META: Record<
  TicketStatus,
  { label: string; icon: LucideIcon; className: string }
> = {
  todo: {
    label: "Todo",
    icon: CircleDashed,
    className: "text-muted-foreground"
  },
  in_progress: {
    label: "In progress",
    icon: CircleDot,
    className: "text-blue-500"
  },
  done: { label: "Done", icon: Check, className: "text-emerald-500" }
}

export const TYPE_META: Record<
  TicketType,
  { label: string; icon: LucideIcon; tone: BadgeTone }
> = {
  feat: { label: "Feature", icon: Sparkles, tone: "emerald" },
  bug: { label: "Bug", icon: Bug, tone: "red" },
  chore: { label: "Chore", icon: Hammer, tone: "amber" },
  other: { label: "Other", icon: HelpCircle, tone: "muted" }
}
