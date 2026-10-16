import * as Option from "effect/Option"

import type { OrgResources } from "../roles/org"
import type { ProjectRoleName } from "../roles/project"
import type * as Statement from "../Statement"
import type { PolicyActor } from "./actor"

export type Update = Readonly<{ body?: boolean; settings?: boolean }>

export const canUpdate = (actor: PolicyActor, update: Update) =>
  (!update.body || actor.permissions.can({ docs: ["write"] })) &&
  (!update.settings || actor.permissions.can({ settings: ["manage"] }))

export const inviteOrgRole = (role: ProjectRoleName) =>
  role === "client" ? "guest" : "member"

export const projectInviteOrgRole = (grants: ReadonlyArray<ProjectRoleName>) =>
  grants.length === 0
    ? Option.none()
    : Option.some(
        grants.some((role) => inviteOrgRole(role) === "member")
          ? ("member" as const)
          : ("guest" as const)
      )

export const canInviteOutsider = (
  actor: PolicyActor,
  org: Statement.Role<OrgResources>,
  role: ProjectRoleName
) =>
  org.can({ invitation: ["create"] }) ||
  (role === "client" && actor.permissions.can({ members: ["invite_client"] }))

export const canCancelInvitation = (
  org: Statement.Role<OrgResources>,
  invitationRole: string
) => invitationRole === "guest" || org.can({ invitation: ["cancel"] })
