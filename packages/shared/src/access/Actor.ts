import type { Statement } from "@pp/access"
import type { PolicyActor } from "@pp/access/policies"
import { Org, Project } from "@pp/access/roles"

import type { OrgPermissions } from "../organizations/Org"
import type { ProjectPermissions } from "../projects/Project"
import { type CanCall, canCallOrg, canCallProject } from "./canCall"

export type ProjectActor = PolicyActor & Readonly<{ call: CanCall }>

export type OrgActor = Readonly<{
  permissions: Statement.Role<Org.OrgResources>
  call: CanCall
}>

const makeProjectActor = (
  permissions: ProjectPermissions,
  userId: string
): ProjectActor => {
  const role = Project.projectStatement.role(permissions)
  return { userId, permissions: role, call: canCallProject(role) }
}

const makeOrgActor = (permissions: OrgPermissions): OrgActor => {
  const role = Org.orgStatement.role(permissions)
  return { permissions: role, call: canCallOrg(role) }
}

export const ProjectActor = {
  make: makeProjectActor,
  none: makeProjectActor({}, "")
}

export const OrgActor = {
  make: makeOrgActor,
  none: makeOrgActor({})
}
