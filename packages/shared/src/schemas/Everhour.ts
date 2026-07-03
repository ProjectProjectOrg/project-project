import * as Schema from "effect/Schema"

export const PersonalEverhour = Schema.Struct({
  connected: Schema.Boolean,
  everhourUserId: Schema.NullOr(Schema.String),
  name: Schema.NullOr(Schema.String),
  email: Schema.NullOr(Schema.String),
  lastVerifiedAt: Schema.NullOr(Schema.Date),
  lastCheckError: Schema.NullOr(Schema.String)
})
export type PersonalEverhour = typeof PersonalEverhour.Type

export const EverhourProjectIntegrationStatus = Schema.Struct({
  status: Schema.Literal("not_connected", "active", "broken"),
  everhourProjectId: Schema.NullOr(Schema.String),
  everhourProjectName: Schema.NullOr(Schema.String),
  lastSyncedAt: Schema.NullOr(Schema.Date),
  lastSyncStatus: Schema.NullOr(Schema.Literal("ok", "error")),
  lastSyncError: Schema.NullOr(Schema.String),
  needsSync: Schema.Boolean
})
export type EverhourProjectIntegrationStatus =
  typeof EverhourProjectIntegrationStatus.Type

export const EverhourSyncSummary = Schema.Struct({
  sectionsCreated: Schema.Number,
  sectionsUpdated: Schema.Number,
  sectionsArchived: Schema.Number,
  tasksCreated: Schema.Number,
  tasksUpdated: Schema.Number,
  tasksClosed: Schema.Number,
  tasksRecreated: Schema.Number,
  tasksSkipped: Schema.Number,
  errors: Schema.Array(Schema.String)
})
export type EverhourSyncSummary = typeof EverhourSyncSummary.Type

export const ConnectEverhourProfileInput = Schema.Struct({
  apiKey: Schema.String.pipe(Schema.minLength(1))
})
export type ConnectEverhourProfileInput =
  typeof ConnectEverhourProfileInput.Type
