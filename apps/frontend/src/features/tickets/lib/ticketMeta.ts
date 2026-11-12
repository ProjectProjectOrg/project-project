import type { ProjectStatus } from "@pp/shared"
import {
  Check,
  Circle,
  CircleDashed,
  CircleDot,
  type LucideIcon
} from "lucide-react"

import { getStatusIcon } from "@/features/statuses/lib/statusIcons"
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
  const row = statuses.find((s) => s.slug === status)
  if (row) return row.label
  const baseline = BASELINE_LABELS[status]
  if (baseline) return baseline()
  return status
}

export function statusMetaFor(
  status: string,
  statuses: ReadonlyArray<ProjectStatus>
): StatusMeta {
  const row = statuses.find((s) => s.slug === status)
  if (row) {
    return {
      label: row.label,
      icon: getStatusIcon(row.icon),
      className: "",
      color: row.color
    }
  }
  const baseline = BASELINE_META[status]
  if (baseline) {
    const labeled = BASELINE_LABELS[status]
    return { ...baseline, label: labeled ? labeled() : baseline.label }
  }
  return {
    label: status,
    icon: Circle,
    className: "text-muted-foreground",
    color: null
  }
}
