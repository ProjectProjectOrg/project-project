import { member, organization, user } from "@pp/db/schema"
import type {
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

export const fixtureVersion = 1
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
    })
  } finally {
    await pool.end()
  }
}

export async function seedContent(origin: string, login: string) {
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
}
