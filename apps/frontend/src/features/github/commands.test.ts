import { Org, Project, Effective } from "@pp/access/roles"
import {
  OrgActor,
  ProjectActor,
  ProjectDetail,
  TicketDetail,
  TicketId
} from "@pp/shared"
import * as Option from "effect/Option"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import * as Schema from "effect/Schema"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  runCommand,
  visibleCommands,
  type CommandContext,
  type CommandEnv
} from "@/features/command-menu/lib/commands"
import { ticketPermissions } from "@/features/tickets/lib/ticketPermissions"

import { gitCommands } from "./commands"

const repoA = {
  repoId: "repo-a",
  repoOwner: "acme",
  repoName: "app",
  defaultBaseBranch: "main"
}
const repoB = {
  repoId: "repo-b",
  repoOwner: "other",
  repoName: "api",
  defaultBaseBranch: "develop"
}
const project = Schema.decodeUnknownSync(ProjectDetail)({
  org: "acme",
  slug: "app",
  key: "APP",
  name: "App",
  icon: "A",
  color: "#123456",
  banner: null,
  iconImage: null,
  createdBy: "user-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  github: repoA,
  githubRepos: [repoA, repoB],
  setup: {
    workflowReviewedAt: null,
    invitePeopleDismissedAt: null,
    connectGithubDismissedAt: null
  },
  body: "",
  members: [],
  pendingMembers: [],
  permissions: {}
})
const detail = Schema.decodeUnknownSync(TicketDetail)({
  id: "T-1",
  title: "Ticket",
  status: "todo",
  type: "other",
  priority: "med",
  tags: [],
  repoId: "repo-b",
  branch: null,
  pr: null,
  prState: null,
  lastTransitionedPr: null,
  parent: null,
  gitState: { tag: "no_branch", baseBranch: "develop" },
  assignees: [],
  archivedAt: null,
  createdBy: "user-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  creator: null,
  updater: null,
  body: ""
})

const contextFor = (
  orgRole: Org.OrgRoleName,
  projectRole: Project.ProjectRoleName | null
): CommandContext => {
  const role = Option.getOrElse(
    Effective.roleOnProject(orgRole, projectRole),
    () => Project.projectStatement.role({})
  )
  const actor = ProjectActor.make(role.grants, "user-1")
  return {
    orgSlug: "acme",
    projectSlug: "app",
    orgActor: OrgActor.make(Org.orgRoles[orgRole].grants),
    projectActor: actor,
    ticket: { orgSlug: "acme", slug: "app", ticketId: TicketId.make("T-1") },
    ticketDetail: detail,
    sprint: null,
    view: null,
    viewerId: "user-1",
    canSeeOrgMembers: false,
    canCreateProjects: false,
    canSendFeedback: false,
    canHoldChildren: true,
    project,
    tickets: ticketPermissions(actor),
    canManageProject: actor.call("projects", "update")
  }
}

const environment = (): CommandEnv => ({
  registry: AtomRegistry.make(),
  execute: vi.fn(),
  navigate: vi.fn(),
  copy: vi.fn(),
  open: vi.fn(),
  actOn: vi.fn(),
  close: vi.fn()
})

afterEach(() => vi.unstubAllGlobals())

describe("GitHub command permissions", () => {
  it.each([
    {
      orgRole: "owner",
      projectRole: null,
      expected: ["git.register-app", "git.connect-installation"]
    },
    {
      orgRole: "admin",
      projectRole: null,
      expected: ["git.register-app", "git.connect-installation"]
    },
    {
      orgRole: "member",
      projectRole: "pm",
      expected: ["git.create-branch", "git.link-branch", "git.connect-repo"]
    },
    {
      orgRole: "member",
      projectRole: "developer",
      expected: ["git.create-branch", "git.link-branch", "git.connect-repo"]
    },
    { orgRole: "member", projectRole: "client", expected: [] }
  ] satisfies ReadonlyArray<
    Readonly<{
      orgRole: Org.OrgRoleName
      projectRole: Project.ProjectRoleName | null
      expected: ReadonlyArray<string>
    }>
  >)(
    "offers only authorized actions for $orgRole / $projectRole",
    ({ orgRole, projectRole, expected }) => {
      expect(
        visibleCommands(gitCommands, contextFor(orgRole, projectRole)).map(
          (command) => command.id
        )
      ).toEqual(expected)
    }
  )

  it("does not execute a command after the actor loses permission", () => {
    const context = contextFor("member", "client")
    const command = gitCommands.find(
      (entry) => entry.id === "git.create-branch"
    )
    if (command === undefined) throw new Error("Expected create branch command")
    const env = environment()
    try {
      runCommand(command, context, env)
      expect(env.open).not.toHaveBeenCalled()
      expect(env.execute).not.toHaveBeenCalled()
    } finally {
      env.registry.dispose()
    }
  })
})

it.each([
  {
    id: "git.open-branch",
    expected: "https://github.com/other/api/tree/feat%2FT-1"
  },
  { id: "git.open-pr", expected: "https://github.com/other/api/pull/7" }
])("$id opens the ticket's repository", ({ id, expected }) => {
  const open = vi.fn()
  vi.stubGlobal("window", { open })
  const context = contextFor("member", "developer")
  const command = gitCommands.find((entry) => entry.id === id)
  if (command === undefined) throw new Error("Expected GitHub command")
  const env = environment()
  try {
    runCommand(
      command,
      { ...context, ticketDetail: { ...detail, branch: "feat/T-1", pr: 7 } },
      env
    )
    expect(open).toHaveBeenCalledWith(expected, "_blank", "noopener,noreferrer")
  } finally {
    env.registry.dispose()
  }
})
