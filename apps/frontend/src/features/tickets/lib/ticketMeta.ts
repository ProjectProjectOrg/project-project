import {
  isEpicType,
  NO_TYPE_FILTER,
  TypeKey,
  type ProjectStatus,
  type TypeFilter
} from "@pp/shared"
import {
  Bug,
  Check,
  Circle,
  CircleDashed,
  CircleDot,
  Hammer,
  HelpCircle,
  Layers,
  Sparkles,
  type LucideIcon
} from "lucide-react"

import type { BadgeTone } from "@/components/ui/badge"
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

export const PICKABLE_TYPES = ["feat", "bug", "chore", "other", "epic"] as const
export type PickableType = (typeof PICKABLE_TYPES)[number]

const NO_TYPE: PickableType = "other"

export const pickableTypeFor = (key: string): PickableType | null =>
  PICKABLE_TYPES.find((type) => type === key && type !== NO_TYPE) ?? null

export const pickableTypeOf = (type: string | null): PickableType =>
  type === null ? NO_TYPE : (pickableTypeFor(type) ?? NO_TYPE)

export const typeKeyOf = (type: PickableType): TypeKey | null =>
  type === NO_TYPE ? null : TypeKey.make(type)

export const TYPE_META: Record<
  PickableType,
  { label: string; icon: LucideIcon; tone: BadgeTone }
> = {
  feat: { label: "Feature", icon: Sparkles, tone: "emerald" },
  bug: { label: "Bug", icon: Bug, tone: "red" },
  chore: { label: "Chore", icon: Hammer, tone: "amber" },
  other: { label: "Other", icon: HelpCircle, tone: "muted" },
  epic: { label: "Epic", icon: Layers, tone: "blue" }
}

export const typeFilterOf = (type: PickableType): TypeFilter =>
  typeKeyOf(type) ?? NO_TYPE_FILTER

export const NON_EPIC_TYPES: ReadonlyArray<PickableType> =
  PICKABLE_TYPES.filter((type) => !isEpicType(type))

export const NON_EPIC_TYPE_FILTERS: ReadonlyArray<TypeFilter> =
  NON_EPIC_TYPES.map(typeFilterOf)

export const TYPE_LABELS: Record<PickableType, () => string> = {
  feat: () => m.tickets_type_feat(),
  bug: () => m.tickets_type_bug(),
  chore: () => m.tickets_type_chore(),
  other: () => m.tickets_type_other(),
  epic: () => m.tickets_type_epic()
}
