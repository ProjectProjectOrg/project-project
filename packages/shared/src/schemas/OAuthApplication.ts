import * as Schema from "effect/Schema"

export const OAuthApplication = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  clientId: Schema.String,
  createdAt: Schema.Date,
  lastUsedAt: Schema.NullOr(Schema.Date)
})
export type OAuthApplication = typeof OAuthApplication.Type
