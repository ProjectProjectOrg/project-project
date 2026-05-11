// Wire shape for a connected MCP agent. One row per (user, registered
// OAuth client) — what shows up in the user's "Connected agents" settings
// page. `lastUsedAt` is derived from the most recent oauth_access_token row
// for this user × client; null if the user never actually completed a
// token exchange after authorizing.

import * as Schema from "effect/Schema"

export const OAuthApplication = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  clientId: Schema.String,
  createdAt: Schema.Date,
  lastUsedAt: Schema.NullOr(Schema.Date)
})
export type OAuthApplication = typeof OAuthApplication.Type
