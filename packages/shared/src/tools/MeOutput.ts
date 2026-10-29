// Output schema for the MCP `me` tool: the authenticated user plus their
// role in each org they belong to.

import * as Schema from "effect/Schema"

import { OrgRole } from "../schemas/Org"
import { User } from "../schemas/User"

export const MeRole = Schema.Struct({
  orgSlug: Schema.String,
  role: OrgRole
})
export type MeRole = typeof MeRole.Type

export const MeOutput = Schema.Struct({
  user: User,
  roles: Schema.Array(MeRole)
})
export type MeOutput = typeof MeOutput.Type
