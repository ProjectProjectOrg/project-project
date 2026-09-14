import * as Schema from "effect/Schema"

export const JiraReconnectReason = Schema.Literals([
  "invalid_grant",
  "missing_scopes"
])
export type JiraReconnectReason = typeof JiraReconnectReason.Type

const JiraDisconnectedConnection = Schema.Struct({
  status: Schema.Literal("disconnected"),
  reconnectReason: Schema.Null,
  connectedAt: Schema.Null
})

const JiraConnectedConnection = Schema.Struct({
  status: Schema.Literal("connected"),
  reconnectReason: Schema.Null,
  connectedAt: Schema.DateTimeUtc
})

const JiraReconnectRequiredConnection = Schema.Struct({
  status: Schema.Literal("reconnect_required"),
  reconnectReason: JiraReconnectReason,
  connectedAt: Schema.DateTimeUtc
})

export const JiraConnection = Schema.Union([
  JiraDisconnectedConnection,
  JiraConnectedConnection,
  JiraReconnectRequiredConnection
])
export type JiraConnection = typeof JiraConnection.Type

export const JiraSite = Schema.Struct({
  cloudId: Schema.String,
  name: Schema.String,
  url: Schema.String,
  avatarUrl: Schema.NullOr(Schema.String)
})
export type JiraSite = typeof JiraSite.Type

export const JiraProjectChoice = Schema.Struct({
  id: Schema.String,
  key: Schema.String,
  name: Schema.String,
  projectTypeKey: Schema.NullOr(Schema.String),
  simplified: Schema.NullOr(Schema.Boolean),
  style: Schema.NullOr(Schema.String),
  avatarUrl: Schema.NullOr(Schema.String)
})
export type JiraProjectChoice = typeof JiraProjectChoice.Type

export const JiraFailureReason = Schema.Literals([
  "network",
  "timeout",
  "invalid_response",
  "server_error",
  "refresh_contention"
])
export type JiraFailureReason = typeof JiraFailureReason.Type
