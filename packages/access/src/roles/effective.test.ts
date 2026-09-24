import * as Option from "effect/Option"
import { describe, expect, it } from "vitest"

import type * as Statement from "../Statement"
import * as Effective from "./effective"
import type * as Org from "./org"
import * as Project from "./project"

type Grants = Statement.Grants<Project.ProjectResources>

const grantsOf = (
  orgRole: Org.OrgRoleName,
  projectRole: Project.ProjectRoleName | null
) =>
  Option.map(
    Effective.projectPermissions(orgRole, projectRole),
    (role) => role.grants
  )

const orgAdminExtras: Grants = {
  ticket: ["read"],
  docs: ["read"],
  github: ["read"],
  time: ["read"],
  figma: ["read"],
  members: ["manage"],
  project: ["archive", "delete"]
}

describe("projectPermissions", () => {
  it("hides the project from org members and guests without a project role", () => {
    expect(grantsOf("member", null)).toStrictEqual(Option.none())
    expect(grantsOf("guest", null)).toStrictEqual(Option.none())
  })

  it("gives org owners and admins without a project role read-only content and member administration", () => {
    for (const orgRole of ["owner", "admin"] as const) {
      expect(grantsOf(orgRole, null)).toStrictEqual(
        Option.some(Project.projectStatement.merge(orgAdminExtras))
      )
    }
  })

  it("lets an org admin without a project role change nothing but members and the project's lifecycle", () => {
    const role = Option.getOrThrow(Effective.projectPermissions("admin", null))
    expect(
      role.can(
        {
          ticket: ["create", "update", "transition", "assign", "delete"],
          comment: ["create"],
          sprint: ["manage"],
          epic: ["manage"],
          workflow: ["manage"],
          library: ["manage"],
          docs: ["write"],
          github: ["write"],
          time: ["log"],
          settings: ["manage"],
          members: ["invite_client"]
        },
        "OR"
      )
    ).toBe(false)
  })

  it("gives org members and guests exactly their project role", () => {
    for (const orgRole of ["member", "guest"] as const) {
      for (const projectRole of ["pm", "developer", "client"] as const) {
        expect(grantsOf(orgRole, projectRole)).toStrictEqual(
          Option.some(Project.projectRoles[projectRole].grants)
        )
      }
    }
  })

  it("adds the org admin extras to a project role", () => {
    expect(grantsOf("admin", "client")).toStrictEqual(
      Option.some(
        Project.projectStatement.merge(Project.client.grants, orgAdminExtras)
      )
    )
    expect(grantsOf("owner", "pm")).toStrictEqual(
      Option.some(Project.projectStatement.all)
    )
  })
})
