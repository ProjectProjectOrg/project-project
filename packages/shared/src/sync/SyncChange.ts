import * as Schema from "effect/Schema"

export const SyncFactKind = Schema.Literals([
  "ticket",
  "group",
  "comments",
  "status",
  "tag",
  "member",
  "project"
])
export type SyncFactKind = typeof SyncFactKind.Type

export const SyncChangeRef = Schema.Struct({
  kind: SyncFactKind,
  id: Schema.String,
  op: Schema.Literals(["upsert", "delete"])
})
export type SyncChangeRef = typeof SyncChangeRef.Type
