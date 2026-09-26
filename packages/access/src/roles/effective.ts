import * as Option from "effect/Option"
import * as Record from "effect/Record"

import type * as Statement from "../Statement"
import * as Org from "./org"
import * as Project from "./project"

type OrgRole = Statement.Role<Org.OrgResources>
type OrgProjectAction = Org.OrgResources["project"]["Type"]
type ProjectGrants = Statement.Grants<Project.ProjectResources>

const grantedOnEveryProjectBy = {
  read_all: {
    ticket: ["read"],
    docs: ["read"],
    github: ["read"],
    time: ["read"],
    figma: ["read"]
  },
  manage_members: { members: ["manage"] },
  archive: { project: ["archive"] },
  delete: { project: ["delete"] }
} satisfies Readonly<Partial<Record<OrgProjectAction, ProjectGrants>>>

const canSeeProject = (
  org: OrgRole,
  projectRole: Project.ProjectRoleName | null
) => projectRole !== null || org.can({ project: ["list_all"] })

const grantsFromOrgRole = (org: OrgRole) =>
  Record.values(
    Record.filter(grantedOnEveryProjectBy, (_, action) =>
      org.can({ project: [action] })
    )
  )

const grantsFromProjectRole = (projectRole: Project.ProjectRoleName | null) =>
  projectRole === null ? {} : Project.projectRoles[projectRole].grants

export const roleOnProject = (
  orgRole: Org.OrgRoleName,
  projectRole: Project.ProjectRoleName | null
) => {
  const org = Org.orgRoles[orgRole]
  if (!canSeeProject(org, projectRole)) return Option.none()
  return Option.some(
    Project.projectStatement.role(
      Project.projectStatement.merge(
        grantsFromProjectRole(projectRole),
        ...grantsFromOrgRole(org)
      )
    )
  )
}
