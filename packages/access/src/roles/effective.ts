import * as Option from "effect/Option"

import type * as Statement from "../Statement"
import * as Org from "./org"
import * as Project from "./project"

const readOnly: Statement.Grants<Project.ProjectResources> = {
  ticket: ["read"],
  docs: ["read"],
  github: ["read"],
  time: ["read"],
  figma: ["read"]
}

export const projectPermissions = (
  orgRole: Org.OrgRoleName,
  projectRole: Project.ProjectRoleName | null
): Option.Option<Statement.Role<Project.ProjectResources>> => {
  const org = Org.orgRoles[orgRole]
  const grantedBy = (
    action: "read_all" | "manage_members" | "archive" | "delete",
    grants: Statement.Grants<Project.ProjectResources>
  ) => (org.can({ project: [action] }) ? grants : {})
  return projectRole === null && !org.can({ project: ["list_all"] })
    ? Option.none()
    : Option.some(
        Project.projectStatement.role(
          Project.projectStatement.merge(
            projectRole === null
              ? {}
              : Project.projectRoles[projectRole].grants,
            grantedBy("read_all", readOnly),
            grantedBy("manage_members", { members: ["manage"] }),
            grantedBy("archive", { project: ["archive"] }),
            grantedBy("delete", { project: ["delete"] })
          )
        )
      )
}
