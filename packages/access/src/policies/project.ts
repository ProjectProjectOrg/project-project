import type { OrgResources } from "../roles/org"
import type { ProjectRoleName } from "../roles/project"
import type * as Statement from "../Statement"
import type { ProjectActor } from "./actor"

export type Update = Readonly<{ body: boolean; settings: boolean }>

export const canUpdate = (actor: ProjectActor, update: Update) =>
  (!update.body || actor.permissions.can({ docs: ["write"] })) &&
  (!update.settings || actor.permissions.can({ settings: ["manage"] }))

export const inviteOrgRole = (role: ProjectRoleName) =>
  role === "client" ? "guest" : "member"

export const canInviteOutsider = (
  actor: ProjectActor,
  org: Statement.Role<OrgResources>,
  role: ProjectRoleName
) =>
  org.can({ invitation: ["create"] }) ||
  (role === "client" && actor.permissions.can({ members: ["invite_client"] }))

export const canCancelInvitation = (
  org: Statement.Role<OrgResources>,
  invitationRole: string
) => invitationRole === "guest" || org.can({ invitation: ["cancel"] })
