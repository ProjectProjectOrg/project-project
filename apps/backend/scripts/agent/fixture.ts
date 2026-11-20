import {
  member,
  organization,
  organizationGithubApp,
  organizationGithubIntegration,
  organizationIntegration,
  user
} from "@pp/db/schema"
import { encodeState, type Repo } from "@pp/integration-github/FakeGitHub"
import type {
  ConnectGithubInput,
  CreateProjectInput,
  CreateTicketInput,
  CreateTagInput,
  CreateGroupInput
} from "@pp/shared"
import { drizzle } from "drizzle-orm/node-postgres"
import * as Schema from "effect/Schema"
import { Pool } from "pg"

const decodeTicket = Schema.decodeUnknownSync(
  Schema.Struct({ id: Schema.String })
)

export const fixtureVersion = 2
export const fixtureEmail = "agent@example.test"
export const fixturePath = "/orgs/agent/projects/verification"

export async function seedIdentity(url: string) {
  const pool = new Pool({ connectionString: url })
  const db = drizzle({ client: pool })
  try {
    await db.transaction(async (tx) => {
      await tx.insert(organization).values({
        id: "agent-org",
        name: "Agent workspace",
        slug: "agent",
        createdAt: new Date()
      })
      await tx.insert(user).values({
        id: "agent-pm",
        name: "Agent PM",
        email: fixtureEmail,
        emailVerified: true,
        username: "agent-pm",
        lastActiveOrganizationId: "agent-org"
      })
      await tx.insert(member).values({
        id: "agent-owner",
        organizationId: "agent-org",
        userId: "agent-pm",
        role: "owner",
        createdAt: new Date()
      })
      const [app] = await tx
        .insert(organizationGithubApp)
        .values({
          organizationId: "agent-org",
          githubAppId: "1",
          slug: "fake-github",
          name: "Fake GitHub",
          ownerLogin: "agent",
          clientId: "fake-github",
          ciphertext: "",
          nonce: "",
          tag: ""
        })
        .returning({ id: organizationGithubApp.id })
      const [integration] = await tx
        .insert(organizationIntegration)
        .values({
          organizationId: "agent-org",
          provider: "github",
          status: "active"
        })
        .returning({ id: organizationIntegration.id })
      await tx.insert(organizationGithubIntegration).values({
        organizationIntegrationId: integration.id,
        githubAppId: app.id,
        installationId: "1",
        githubAccountId: "agent",
        githubAccountLogin: "agent",
        githubAccountType: "Organization"
      })
    })
  } finally {
    await pool.end()
  }
}

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000)

const verificationRepo = (
  t: Readonly<
    Record<
      "branchOnly" | "draft" | "failing" | "stack" | "merged" | "closed",
      string
    >
  >
) =>
  ({
    id: "1",
    owner: "agent",
    name: "verification",
    defaultBranch: "main",
    branches: [
      "main",
      `feat/${t.branchOnly}-no-pr-yet`,
      `feat/${t.draft}-draft`,
      `fix/${t.failing}-flaky-login`,
      `feat/${t.stack}-api`,
      `feat/${t.stack}-ui`,
      `feat/${t.stack}-polish`,
      `feat/${t.merged}-shipped`,
      `chore/${t.closed}-abandoned`
    ],
    pullRequests: [
      {
        number: 1,
        head: `feat/${t.merged}-shipped`,
        base: "main",
        title: `${t.merged} Ship the export button`,
        body: "",
        checks: "passing",
        state: "merged",
        mergedAt: daysAgo(2)
      },
      {
        number: 2,
        head: `feat/${t.draft}-draft`,
        base: "main",
        title: `${t.draft} Draft settings page`,
        body: "",
        checks: "pending",
        state: "open",
        draft: true
      },
      {
        number: 3,
        head: `fix/${t.failing}-flaky-login`,
        base: "main",
        title: `${t.failing} Fix the flaky login`,
        body: "",
        checks: "failing",
        state: "open",
        draft: false
      },
      {
        number: 4,
        head: `feat/${t.stack}-api`,
        base: "main",
        title: `${t.stack} Add the search API`,
        body: "",
        checks: "passing",
        state: "open",
        draft: false
      },
      {
        number: 5,
        head: `feat/${t.stack}-ui`,
        base: `feat/${t.stack}-api`,
        title: `${t.stack} Add the search UI`,
        body: "",
        checks: "pending",
        state: "open",
        draft: false
      },
      {
        number: 6,
        head: `feat/${t.stack}-polish`,
        base: `feat/${t.stack}-ui`,
        title: `${t.stack} Polish search`,
        body: "",
        checks: "none",
        state: "open",
        draft: true
      },
      {
        number: 7,
        head: `chore/${t.closed}-abandoned`,
        base: "main",
        title: `${t.closed} Abandoned cleanup`,
        body: "",
        checks: "neutral",
        state: "closed"
      }
    ]
  }) satisfies Repo

export async function seedContent(
  origin: string,
  login: string,
  gitHubStatePath: string
) {
  const verification = new URL(login)
  const response = await fetch(
    `${origin}${verification.pathname}${verification.search}`,
    { redirect: "manual" }
  )
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ")
  if (!cookie) throw new Error("Fixture sign-in did not create a session")
  const post = async (
    route: string,
    payload:
      | typeof CreateProjectInput.Encoded
      | typeof CreateTicketInput.Encoded
      | typeof CreateTagInput.Encoded
      | typeof CreateGroupInput.Encoded
      | typeof ConnectGithubInput.Encoded
  ) => {
    const result = await fetch(`${origin}/api${route}`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(payload)
    })
    if (!result.ok)
      throw new Error(
        `Fixture ${route}: ${result.status} ${await result.text()}`
      )
    return result.json()
  }
  await post("/orgs/agent/projects", { name: "Verification", key: "AV" })
  const route = "/orgs/agent/projects/verification"
  await post(`${route}/tags`, { name: "frontend" })
  const epic = decodeTicket(
    await post(`${route}/tickets`, {
      title: "Improve the verification workflow",
      type: "epic",
      body: "A small synthetic project for verifying changes locally."
    })
  )
  const first = decodeTicket(
    await post(`${route}/tickets`, {
      title: "Check ticket editing",
      type: "feat",
      status: "in_progress",
      priority: "high",
      parent: epic.id,
      assignees: ["agent-pm"],
      tags: ["frontend"],
      body: "## Acceptance criteria\n\n- [ ] Edit the title and description\n- [ ] Verify changes survive a reload"
    })
  )
  const second = decodeTicket(
    await post(`${route}/tickets`, {
      title: "Verify keyboard navigation",
      type: "bug",
      status: "todo",
      blockedBy: [first.id],
      body: "Move between tickets with J and K."
    })
  )
  await post(`${route}/tickets`, {
    title: "Confirm completed tickets render",
    type: "chore",
    status: "done",
    body: "This ticket starts completed."
  })
  await post(`${route}/groups`, {
    name: "Verification sprint",
    kind: "sprint",
    tickets: [first.id, second.id]
  })
  const gitTicket = async (title: string, type: string) =>
    decodeTicket(
      await post(`${route}/tickets`, { title, type, status: "in_progress" })
    ).id
  const repo = verificationRepo({
    branchOnly: await gitTicket("Branch pushed, no pull request yet", "feat"),
    draft: await gitTicket("Draft pull request with pending checks", "feat"),
    failing: await gitTicket("Pull request with failing checks", "bug"),
    stack: await gitTicket("Stack of three pull requests", "feat"),
    merged: await gitTicket("Merged pull request", "feat"),
    closed: await gitTicket("Pull request closed without merging", "chore")
  })
  await Bun.write(gitHubStatePath, encodeState({ repos: [repo] }))
  await post(`${route}/github`, {
    repoId: repo.id,
    repoOwner: repo.owner,
    repoName: repo.name
  })
}
