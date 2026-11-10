import * as Schema from "effect/Schema"

export const BacklogGrouping = Schema.Literals([
  "status",
  "sprint",
  "epic",
  "parent"
])
export type BacklogGrouping = typeof BacklogGrouping.Type

export type ParentGrouping = Extract<BacklogGrouping, "epic" | "parent">
