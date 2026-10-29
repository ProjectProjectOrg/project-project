// Output schema for the MCP `me` tool: the authenticated user plus their
// role in each org they belong to.

import * as Schema from "effect/Schema"
import * as Struct from "effect/Struct"

import { OrgRole } from "../schemas/Org"
import { User } from "../schemas/User"

export const MeRole = Schema.Struct({
  orgSlug: Schema.String,
  role: OrgRole
})
export type MeRole = typeof MeRole.Type

export const MeUser = Schema.Struct(
  Struct.omit(User.fields, ["activeOrgSlug", "editorPreference"])
)
export type MeUser = typeof MeUser.Type

export const MeOutput = Schema.Struct({
  user: MeUser,
  roles: Schema.Array(MeRole)
})
export type MeOutput = typeof MeOutput.Type
