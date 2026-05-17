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
import { m } from "@/paraglide/messages"

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
    className: "text-state-info"
  },
  done: { label: "Done", icon: Check, className: "text-state-success" }
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

export const STATUS_LABELS: Record<TicketStatus, () => string> = {
  todo: () => m.tickets_status_todo(),
  in_progress: () => m.tickets_status_in_progress(),
  done: () => m.tickets_status_done()
}

export const TYPE_LABELS: Record<TicketType, () => string> = {
  feat: () => m.tickets_type_feat(),
  bug: () => m.tickets_type_bug(),
  chore: () => m.tickets_type_chore(),
  other: () => m.tickets_type_other()
}
