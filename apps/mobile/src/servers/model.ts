import * as Schema from "effect/Schema"

export const ServerUser = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String
})
export type ServerUser = typeof ServerUser.Type

export const ServerOrg = Schema.Struct({
  slug: Schema.String,
  name: Schema.String
})
export type ServerOrg = typeof ServerOrg.Type

export const SavedServer = Schema.Struct({
  instanceId: Schema.NonEmptyString,
  origin: Schema.String,
  name: Schema.String,
  logo: Schema.NullOr(Schema.String),
  protocolVersion: Schema.Int,
  user: Schema.NullOr(ServerUser),
  orgs: Schema.Array(ServerOrg)
})
export type SavedServer = typeof SavedServer.Type

export const ServerTokens = Schema.Struct({
  accessToken: Schema.String,
  refreshToken: Schema.String,
  expiresAt: Schema.Finite
})
export type ServerTokens = typeof ServerTokens.Type

export const OrgLocation = Schema.Struct({
  instanceId: Schema.NonEmptyString,
  orgSlug: Schema.String
})
export type OrgLocation = typeof OrgLocation.Type

export const ServerCatalog = Schema.Struct({
  version: Schema.Literal(1),
  servers: Schema.Array(SavedServer),
  lastUsedOrg: Schema.NullOr(OrgLocation)
})
export type ServerCatalog = typeof ServerCatalog.Type

export const emptyCatalog: ServerCatalog = {
  version: 1,
  servers: [],
  lastUsedOrg: null
}
