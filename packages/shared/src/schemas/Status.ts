import * as Schema from "effect/Schema"

import { TagColor } from "./Tag"

export const BASELINE_STATUS_SLUGS = ["todo", "in_progress", "done"] as const
export type BaselineStatusSlug = (typeof BASELINE_STATUS_SLUGS)[number]

export const BASELINE_STATUS_SEED = [
  {
    slug: "todo",
    label: "Todo",
    icon: "CircleDashed",
    color: "#a3a3a3",
    orderKey: "a0",
    description:
      "Ready to be picked up: the work is defined and nobody has started it yet."
  },
  {
    slug: "in_progress",
    label: "In progress",
    icon: "CircleDot",
    color: "#3b82f6",
    orderKey: "a1",
    description: "Someone is actively working on it."
  },
  {
    slug: "done",
    label: "Done",
    icon: "CircleCheck",
    color: "#22c55e",
    orderKey: "a2",
    description: "Finished: the work is merged or otherwise complete."
  }
] as const

export const baselineStatusDescription = (slug: string): string | null =>
  BASELINE_STATUS_SEED.find((baseline) => baseline.slug === slug)
    ?.description ?? null

export const StatusSlug = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^[a-z0-9_]+$/u)),
  Schema.check(Schema.isMinLength(1)),
  Schema.check(Schema.isMaxLength(40)),
  Schema.brand("StatusSlug")
)
export type StatusSlug = typeof StatusSlug.Type

export const StatusLabel = Schema.String.pipe(
  Schema.check(Schema.isMinLength(1)),
  Schema.check(Schema.isMaxLength(40)),
  Schema.brand("StatusLabel")
)
export type StatusLabel = typeof StatusLabel.Type

export const STATUS_ICONS = [
  "Circle",
  "CircleDot",
  "CircleDashed",
  "CircleDotDashed",
  "CircleCheck",
  "Loader",
  "Hourglass",
  "Timer",
  "Eye",
  "Search",
  "ScanLine",
  "Microscope",
  "ShieldCheck",
  "Ban",
  "AlertCircle",
  "AlertTriangle",
  "Lock",
  "XCircle",
  "Archive",
  "Skull",
  "Trash",
  "Lightbulb",
  "Bookmark",
  "Inbox",
  "Trophy",
  "Sparkles",
  "Rocket",
  "Flame",
  "Award",
  "Square",
  "Triangle",
  "Hexagon",
  "Diamond"
] as const
export type StatusIconName = (typeof STATUS_ICONS)[number]

export const StatusIcon = Schema.Literals(STATUS_ICONS)

export const StatusIconValue = Schema.String

export const StatusColor = TagColor

export const OrderKey = Schema.String.pipe(
  Schema.check(Schema.isMinLength(1)),
  Schema.check(Schema.isMaxLength(64)),
  Schema.brand("OrderKey")
)
export type OrderKey = typeof OrderKey.Type

export const STATUS_DESCRIPTION_MAX_LENGTH = 500

export const StatusDescription = Schema.String.pipe(
  Schema.check(Schema.isMinLength(1)),
  Schema.check(Schema.isMaxLength(STATUS_DESCRIPTION_MAX_LENGTH))
)

export const ProjectStatus = Schema.Struct({
  slug: StatusSlug,
  label: StatusLabel,
  icon: StatusIconValue,
  color: StatusColor,
  orderKey: OrderKey,
  description: Schema.NullOr(StatusDescription),
  createdBy: Schema.String,
  createdAt: Schema.DateFromString
})
export type ProjectStatus = typeof ProjectStatus.Type

export const CreateStatusInput = Schema.Struct({
  label: StatusLabel,
  icon: Schema.optional(StatusIcon),
  color: Schema.optional(StatusColor)
})
export type CreateStatusInput = typeof CreateStatusInput.Type

export const UpdateStatusInput = Schema.Struct({
  label: Schema.optional(StatusLabel),
  icon: Schema.optional(StatusIcon),
  color: Schema.optional(StatusColor),
  description: Schema.optional(Schema.NullOr(StatusDescription))
})
export type UpdateStatusInput = typeof UpdateStatusInput.Type

export const ReorderStatusInput = Schema.Struct({
  orderKey: OrderKey
})
export type ReorderStatusInput = typeof ReorderStatusInput.Type

export const DeleteStatusInput = Schema.Struct({
  reassignTo: Schema.optional(StatusSlug)
})
export type DeleteStatusInput = typeof DeleteStatusInput.Type
