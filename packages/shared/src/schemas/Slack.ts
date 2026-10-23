import * as Schema from "effect/Schema"

import { ProjectEvent, ProjectEventKind } from "./ProjectEvent"

const Secret = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(4096)
)
export const SlackChannelId = Schema.String.check(
  Schema.isPattern(/^[CG][A-Z0-9]+$/u)
)
export const SlackEvent = ProjectEventKind
export type SlackEvent = typeof SlackEvent.Type

export const ConnectSlackInput = Schema.Struct({
  botToken: Secret.check(Schema.isPattern(/^xoxb-/u)),
  appToken: Secret.check(Schema.isPattern(/^xapp-/u)),
  clientId: Schema.String.check(Schema.isPattern(/^\d+\.\d+$/u)),
  clientSecret: Secret
})
export type ConnectSlackInput = typeof ConnectSlackInput.Type

export const SlackOrgStatus = Schema.Struct({
  connection: Schema.NullOr(
    Schema.Struct({
      teamId: Schema.String,
      teamName: Schema.String,
      clientId: Schema.String,
      lastError: Schema.NullOr(Schema.String)
    })
  )
})
export type SlackOrgStatus = typeof SlackOrgStatus.Type

export const SlackChannel = Schema.Struct({
  id: SlackChannelId,
  name: Schema.String
})
export type SlackChannel = typeof SlackChannel.Type
export const SaveSlackProjectInput = Schema.Struct({
  channelId: SlackChannelId,
  events: Schema.Array(SlackEvent)
})
export type SaveSlackProjectInput = typeof SaveSlackProjectInput.Type
export const SlackProjectStatus = Schema.Struct({
  workspace: Schema.NullOr(
    Schema.Struct({ teamId: Schema.String, teamName: Schema.String })
  ),
  settings: Schema.NullOr(
    Schema.Struct({
      ...SaveSlackProjectInput.fields,
      channelName: Schema.String
    })
  )
})
export type SlackProjectStatus = typeof SlackProjectStatus.Type

export const SlackProfile = Schema.Struct({
  orgSlug: Schema.String,
  orgName: Schema.String,
  teamName: Schema.String,
  slackUserId: Schema.NullOr(Schema.String),
  displayName: Schema.NullOr(Schema.String)
})
export type SlackProfile = typeof SlackProfile.Type

export const SlackNotification = Schema.Union([
  ProjectEvent,
  Schema.Struct({ kind: Schema.Literal("test"), title: Schema.String })
])
export type SlackNotification = typeof SlackNotification.Type

export class SlackNotConnected extends Schema.TaggedError<SlackNotConnected>()(
  "SlackNotConnected",
  {},
  { httpApiStatus: 409 }
) {}
export class SlackAuthInvalid extends Schema.TaggedError<SlackAuthInvalid>()(
  "SlackAuthInvalid",
  {},
  { httpApiStatus: 400 }
) {}
export class SlackError extends Schema.TaggedError<SlackError>()(
  "SlackError",
  { reason: Schema.String },
  { httpApiStatus: 502 }
) {}
export class SlackRateLimited extends Schema.TaggedError<SlackRateLimited>()(
  "SlackRateLimited",
  { retryAfterSeconds: Schema.Finite },
  { httpApiStatus: 429 }
) {}
