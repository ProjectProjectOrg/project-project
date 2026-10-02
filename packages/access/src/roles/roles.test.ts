import * as Exit from "effect/Exit"
import * as Record from "effect/Record"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import type * as Statement from "../Statement"
import * as Org from "./org"
import * as Project from "./project"

type Row<S extends Statement.Resources, Name extends string> = readonly [
  action: string,
  request: Statement.Grants<S>,
  allowed: ReadonlyArray<Name>,
  connector?: Statement.Connector
]

const decodeOrgGrants = Schema.decodeExit(Org.orgStatement.schema)

const decodeProjectGrants = Schema.decodeExit(Project.projectStatement.schema)

const orgMatrix: ReadonlyArray<Row<Org.OrgResources, Org.OrgRoleName>> = [
  ["delete the org", { organization: ["delete"] }, ["owner"]],
  ["transfer ownership", { organization: ["transfer"] }, ["owner"]],
  ["manage billing", { billing: ["manage"] }, ["owner"]],
  ["update org details", { organization: ["update"] }, ["owner", "admin"]],
  [
    "invite people",
    { invitation: ["create", "cancel"], member: ["create"] },
    ["owner", "admin"]
  ],
  [
    "remove people and change org roles",
    { member: ["update", "delete"] },
    ["owner", "admin"]
  ],
  ["manage integrations", { integration: ["manage"] }, ["owner", "admin"]],
  ["manage storage", { storage: ["manage"] }, ["owner", "admin"]],
  [
    "manage org blocks and templates",
    { library: ["manage"] },
    ["owner", "admin"]
  ],
  [
    "see all projects, manage their members, archive and delete them",
    { project: ["list_all", "manage_members", "archive", "delete"] },
    ["owner", "admin"]
  ],
  ["create projects", { project: ["create"] }, ["owner", "admin", "member"]],
  [
    "see the org member directory",
    { member: ["read"] },
    ["owner", "admin", "member"]
  ]
]

const projectMatrix: ReadonlyArray<
  Row<Project.ProjectResources, Project.ProjectRoleName>
> = [
  [
    "view board, tickets, sprints and docs",
    { ticket: ["read"], docs: ["read"] },
    ["pm", "developer", "client"]
  ],
  ["create tickets", { ticket: ["create"] }, ["pm", "developer", "client"]],
  ["edit any ticket's content", { ticket: ["update"] }, ["pm", "developer"]],
  [
    "edit their own ticket's content",
    { ticket: ["update", "update_own"] },
    ["pm", "developer", "client"],
    "OR"
  ],
  [
    "change status and assignee",
    { ticket: ["transition", "assign"] },
    ["pm", "developer"]
  ],
  ["delete tickets", { ticket: ["delete"] }, ["pm"]],
  ["comment", { comment: ["create"] }, ["pm", "developer", "client"]],
  [
    "edit and delete their own comments",
    { comment: ["update_own", "delete_own"] },
    ["pm", "developer", "client"]
  ],
  ["edit or delete others' comments", { comment: ["moderate"] }, ["pm"]],
  ["manage epics", { epic: ["manage"] }, ["pm", "developer"]],
  ["plan sprints and milestones", { sprint: ["manage"] }, ["pm"]],
  [
    "see GitHub state, branches and PRs",
    { github: ["read"] },
    ["pm", "developer"]
  ],
  ["create branches and PRs", { github: ["write"] }, ["pm", "developer"]],
  ["log time and see totals", { time: ["read", "log"] }, ["pm", "developer"]],
  ["see Figma links", { figma: ["read"] }, ["pm", "developer", "client"]],
  ["edit docs", { docs: ["write"] }, ["pm", "developer"]],
  ["manage tags, statuses and workflow", { workflow: ["manage"] }, ["pm"]],
  ["manage project blocks and templates", { library: ["manage"] }, ["pm"]],
  [
    "manage project settings and integrations",
    { settings: ["manage"] },
    ["pm"]
  ],
  ["manage project members", { members: ["manage"] }, ["pm"]],
  ["invite an outside email as client", { members: ["invite_client"] }, ["pm"]],
  ["archive or delete the project", { project: ["archive", "delete"] }, ["pm"]]
]

const checkMatrix = <S extends Statement.Resources, Name extends string>(
  roles: Readonly<Record<Name, Statement.Role<S>>>,
  matrix: ReadonlyArray<Row<S, Name>>
) => {
  for (const [action, request, allowed, connector] of matrix) {
    for (const [name, role] of Record.toEntries(roles)) {
      const expected = allowed.includes(name)
      it(`${name} ${expected ? "can" : "cannot"} ${action}`, () => {
        expect(role.can(request, connector)).toBe(expected)
      })
    }
  }
}

describe("org roles", () => {
  checkMatrix(Org.orgRoles, orgMatrix)

  it("stores every built-in role in a form the statement schema decodes", () => {
    for (const role of Object.values(Org.orgRoles)) {
      expect(decodeOrgGrants(role.grants)).toStrictEqual(
        Exit.succeed(role.grants)
      )
    }
  })

  it("gives the owner every org permission", () => {
    expect(Org.owner.grants).toStrictEqual(Org.orgStatement.all)
  })

  it("gives a guest no org permissions", () => {
    expect(Org.guest.grants).toStrictEqual({})
  })
})

describe("project roles", () => {
  checkMatrix(Project.projectRoles, projectMatrix)

  it("stores every built-in role in a form the statement schema decodes", () => {
    for (const role of Object.values(Project.projectRoles)) {
      expect(decodeProjectGrants(role.grants)).toStrictEqual(
        Exit.succeed(role.grants)
      )
    }
  })

  it("gives a PM every project permission", () => {
    expect(Project.pm.grants).toStrictEqual(Project.projectStatement.all)
  })

  it("gives a client no GitHub, Everhour, settings or member access", () => {
    expect(
      Project.client.can(
        {
          github: ["read"],
          time: ["read"],
          settings: ["manage"],
          members: ["manage"]
        },
        "OR"
      )
    ).toBe(false)
  })
})
