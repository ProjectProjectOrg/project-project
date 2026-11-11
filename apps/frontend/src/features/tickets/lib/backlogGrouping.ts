import type { BacklogGrouping } from "@pp/shared"

export type ParentGrouping = Extract<BacklogGrouping, "epic" | "parent">
