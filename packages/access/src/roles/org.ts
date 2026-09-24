import * as Schema from "effect/Schema"

import * as Statement from "../Statement"

export const orgStatement = Statement.make({
  organization: Schema.Literals(["update", "delete", "transfer"]),
  billing: Schema.Literals(["manage"]),
  member: Schema.Literals(["read", "create", "update", "delete"]),
  invitation: Schema.Literals(["create", "cancel"]),
  team: Schema.Literals(["create", "update", "delete"]),
  ac: Schema.Literals(["create", "read", "update", "delete"]),
  project: Schema.Literals([
    "create",
    "list_all",
    "manage_members",
    "archive",
    "delete"
  ]),
  integration: Schema.Literals(["manage"]),
  storage: Schema.Literals(["manage"]),
  library: Schema.Literals(["manage"])
})

export type OrgResources = typeof orgStatement.resources

export const owner = orgStatement.role(orgStatement.all)

export const admin = orgStatement.role({
  organization: ["update"],
  member: ["read", "create", "update", "delete"],
  invitation: ["create", "cancel"],
  team: ["create", "update", "delete"],
  ac: ["create", "read", "update", "delete"],
  project: ["create", "list_all", "manage_members", "archive", "delete"],
  integration: ["manage"],
  storage: ["manage"],
  library: ["manage"]
})

export const member = orgStatement.role({
  member: ["read"],
  ac: ["read"],
  project: ["create"]
})

export const guest = orgStatement.role({})

export const OrgRoleName = Schema.Literals([
  "owner",
  "admin",
  "member",
  "guest"
])

export type OrgRoleName = typeof OrgRoleName.Type

export const orgRoles = { owner, admin, member, guest } satisfies Readonly<
  Record<OrgRoleName, Statement.Role<OrgResources>>
>
