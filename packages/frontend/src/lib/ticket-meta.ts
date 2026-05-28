import {
  Bug,
  Check,
  Circle,
  CircleDashed,
  CircleDot,
  Hammer,
  HelpCircle,
  Sparkles,
  type LucideIcon
} from "lucide-react"
import type { ProjectStatus, TicketType } from "@projectproject/shared"
import type { BadgeTone } from "@/components/ui/badge"
import { getStatusIcon } from "@/lib/status-icons"
import { m } from "@/paraglide/messages"

export type StatusMeta = {
  label: string
  icon: LucideIcon
  className: string
  color: string | null
}

const BASELINE_META: Record<string, StatusMeta> = {
  todo: {
    label: "Todo",
    icon: CircleDashed,
    className: "text-muted-foreground",
    color: "var(--muted-foreground)"
  },
  in_progress: {
    label: "In progress",
    icon: CircleDot,
    className: "text-state-info",
    color: "var(--state-info)"
  },
  done: {
    label: "Done",
    icon: Check,
    className: "text-state-success",
    color: "var(--state-success)"
  }
}

const BASELINE_LABELS: Record<string, () => string> = {
  todo: () => m.tickets_status_todo(),
  in_progress: () => m.tickets_status_in_progress(),
  done: () => m.tickets_status_done()
}

export function statusLabelFor(
  status: string,
  statuses: ReadonlyArray<ProjectStatus>
): string {
  const baseline = BASELINE_LABELS[status]
  if (baseline) return baseline()
  const row = statuses.find((s) => s.slug === status)
  return row?.label ?? status
}

export function statusMetaFor(
  status: string,
  statuses: ReadonlyArray<ProjectStatus>
): StatusMeta {
  const baseline = BASELINE_META[status]
  if (baseline) {
    const labeled = BASELINE_LABELS[status]
    return { ...baseline, label: labeled ? labeled() : baseline.label }
  }
  const row = statuses.find((s) => s.slug === status)
  if (!row) {
    return {
      label: status,
      icon: Circle,
      className: "text-muted-foreground",
      color: null
    }
  }
  return {
    label: row.label,
    icon: getStatusIcon(row.icon),
    className: "",
    color: row.color
  }
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

export const TYPE_LABELS: Record<TicketType, () => string> = {
  feat: () => m.tickets_type_feat(),
  bug: () => m.tickets_type_bug(),
  chore: () => m.tickets_type_chore(),
  other: () => m.tickets_type_other()
}
