import type { Statement } from "@pp/access"
import { Org, Project } from "@pp/access/roles"

import type { OrgPermissions } from "../schemas/Org"
import type { ProjectPermissions } from "../schemas/Project"
import { type CanCall, canCallOrg, canCallProject } from "./canCall"

export type ProjectActor = Readonly<{
  userId: string
  permissions: Statement.Role<Project.ProjectResources>
  call: CanCall
}>

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
