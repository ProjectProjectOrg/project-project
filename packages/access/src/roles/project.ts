import * as Schema from "effect/Schema"

import * as Statement from "../Statement"

export const projectStatement = Statement.make({
  ticket: Schema.Literals([
    "read",
    "create",
    "update",
    "update_own",
    "delete",
    "transition",
    "assign"
  ]),
  comment: Schema.Literals(["create", "update_own", "delete_own", "moderate"]),
  sprint: Schema.Literals(["manage"]),
  epic: Schema.Literals(["manage"]),
  workflow: Schema.Literals(["manage"]),
  library: Schema.Literals(["manage"]),
  docs: Schema.Literals(["read", "write"]),
  github: Schema.Literals(["read", "write"]),
  time: Schema.Literals(["read", "log"]),
  figma: Schema.Literals(["read"]),
  attachment: Schema.Literals(["upload"]),
  settings: Schema.Literals(["manage"]),
  members: Schema.Literals(["manage", "invite_client"]),
  project: Schema.Literals(["archive", "delete"])
})

export type ProjectResources = typeof projectStatement.resources

export const pm = projectStatement.role(projectStatement.all)

export const developer = projectStatement.role({
  ticket: ["read", "create", "update", "transition", "assign"],
  comment: ["create", "update_own", "delete_own"],
  epic: ["manage"],
  docs: ["read", "write"],
  github: ["read", "write"],
  time: ["read", "log"],
  figma: ["read"],
  attachment: ["upload"]
})

export const client = projectStatement.role({
  ticket: ["read", "create", "update_own"],
  comment: ["create", "update_own", "delete_own"],
  docs: ["read"],
  figma: ["read"],
  attachment: ["upload"]
})

export const ProjectRoleName = Schema.Literals(["pm", "developer", "client"])

export type ProjectRoleName = typeof ProjectRoleName.Type

export const projectRoles = { pm, developer, client } satisfies Readonly<
  Record<ProjectRoleName, Statement.Role<ProjectResources>>
>
