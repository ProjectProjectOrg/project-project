import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  FetchHttpClient,
  HttpApiBuilder,
  HttpApiClient,
  HttpServer
} from "@effect/platform"
import { AppApi, Authentication } from "@projectproject/shared"
import { ConfigProvider, Effect, Layer } from "effect"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as nodePath from "node:path"
import { eq } from "drizzle-orm"
import { ApiLive } from "../main"
import { BetterAuth } from "../services/BetterAuth"
import { Db, DbLive } from "../services/Db"
import {
  commentIndex,
  member,
  organization,
  projectIndex,
  projectMember,
  user
} from "../db/schema"

const ORG_SLUG = "test-org-comments"
const ORG_ID = "org_t19_comments_x"
const PROJECT_SLUG = "test-proj-comments"
const ALICE_ID = "u_alice_t19_x"
const BOB_ID = "u_bob_t19_x"
const TICKET_ID = "T-1"

let tmpRoot: string
let currentUserId = ALICE_ID

const alice = {
  id: ALICE_ID,
  name: "Alice",
  email: "alice-t19x@test.local",
  username: "alice-t19x",
  image: null,
  createdAt: new Date("2026-05-07T00:00:00.000Z"),
  activeOrgSlug: ORG_SLUG
}

const bob = {
  id: BOB_ID,
  name: "Bob",
  email: "bob-t19x@test.local",
  username: "bob-t19x",
  image: null,
  createdAt: new Date("2026-05-07T00:00:00.000Z"),
  activeOrgSlug: ORG_SLUG
}

const FakeAuthenticationLive = Layer.effect(
  Authentication,
  Effect.gen(function* () {
    return Authentication.of({
      sessionCookie: (_token) =>
        Effect.sync(() => (currentUserId === ALICE_ID ? alice : bob))
    })
  })
)

const FakeBetterAuthLive = Layer.succeed(BetterAuth, {} as never)

function getTestConfig() {
  return ConfigProvider.fromMap(
    new Map([
      ["PROJECTS_DIR", tmpRoot],
      ["DATABASE_URL", process.env.DATABASE_URL ?? ""]
    ])
  )
}

const runDb = (eff: Effect.Effect<any, any, any>): Promise<any> =>
  Effect.runPromise(eff as Effect.Effect<any, never, never>)

const seedRows = async (db: any) => {
  await runDb(
    db
      .insert(user)
      .values([
        {
          id: ALICE_ID,
          name: "Alice",
          email: "alice-t19x@test.local",
          emailVerified: true,
          image: null,
          username: "alice-t19x",
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: BOB_ID,
          name: "Bob",
          email: "bob-t19x@test.local",
          emailVerified: true,
          image: null,
          username: "bob-t19x",
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ])
      .onConflictDoNothing()
  )
  await runDb(
    db
      .insert(organization)
      .values({
        id: ORG_ID,
        name: "Test Org Comments",
        slug: ORG_SLUG,
        createdAt: new Date()
      })
      .onConflictDoNothing()
  )
  await runDb(
    db
      .insert(member)
      .values([
        {
          id: `m_alice_${ORG_ID}`,
          organizationId: ORG_ID,
          userId: ALICE_ID,
          role: "owner",
          createdAt: new Date()
        },
        {
          id: `m_bob_${ORG_ID}`,
          organizationId: ORG_ID,
          userId: BOB_ID,
          role: "member",
          createdAt: new Date()
        }
      ])
      .onConflictDoNothing()
  )
  await runDb(
    db
      .insert(projectIndex)
      .values({
        slug: PROJECT_SLUG,
        name: "Test Project Comments",
        createdBy: ALICE_ID,
        createdAt: new Date(),
        organizationId: ORG_ID
      })
      .onConflictDoNothing()
  )
  await runDb(
    db
      .insert(projectMember)
      .values([
        {
          projectSlug: PROJECT_SLUG,
          userId: ALICE_ID,
          role: "owner",
          createdAt: new Date()
        },
        {
          projectSlug: PROJECT_SLUG,
          userId: BOB_ID,
          role: "member",
          createdAt: new Date()
        }
      ])
      .onConflictDoNothing()
  )
}

const cleanupRows = async (db: any) => {
  await runDb(
    db.delete(commentIndex).where(eq(commentIndex.projectSlug, PROJECT_SLUG))
  )
  await runDb(
    db.delete(projectMember).where(eq(projectMember.projectSlug, PROJECT_SLUG))
  )
  await runDb(
    db.delete(projectIndex).where(eq(projectIndex.slug, PROJECT_SLUG))
  )
  await runDb(db.delete(member).where(eq(member.organizationId, ORG_ID)))
  await runDb(db.delete(organization).where(eq(organization.id, ORG_ID)))
  await runDb(db.delete(user).where(eq(user.id, ALICE_ID)))
  await runDb(db.delete(user).where(eq(user.id, BOB_ID)))
}

const ticketContent = () =>
  [
    "---",
    `id: ${TICKET_ID}`,
    "title: Test",
    "status: todo",
    "type: feat",
    "branch: null",
    `createdBy: ${ALICE_ID}`,
    "createdAt: 2026-05-07T00:00:00.000Z",
    "updatedAt: 2026-05-07T00:00:00.000Z",
    "---",
    "",
    "# Test",
    "",
    "Description here.",
    ""
  ].join("\n")

let testHandler: (req: Request) => Promise<Response>

beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(nodePath.join(os.tmpdir(), "ppcomments-"))
  const ticketDir = nodePath.join(
    tmpRoot,
    "orgs",
    ORG_SLUG,
    "projects",
    PROJECT_SLUG,
    "tickets"
  )
  await fs.mkdir(ticketDir, { recursive: true })
  await fs.writeFile(
    nodePath.join(ticketDir, `${TICKET_ID}.md`),
    ticketContent(),
    "utf8"
  )
  currentUserId = ALICE_ID

  const testConfig = getTestConfig()
  const configLayer = Layer.setConfigProvider(testConfig)

  const TestApiLayer = ApiLive.pipe(
    Layer.provide(FakeAuthenticationLive),
    Layer.provide(FakeBetterAuthLive),
    Layer.provide(DbLive),
    Layer.provide(configLayer)
  )

  const { handler } = HttpApiBuilder.toWebHandler(
    Layer.mergeAll(TestApiLayer, HttpServer.layerContext)
  )
  testHandler = handler

  const dbValue = await Effect.runPromise(
    Effect.flatMap(Db, (d) => Effect.succeed(d)).pipe(
      Effect.provide(DbLive.pipe(Layer.provide(configLayer)))
    )
  )
  await seedRows(dbValue)
})

afterEach(async () => {
  const testConfig = getTestConfig()
  const configLayer = Layer.setConfigProvider(testConfig)
  const dbValue = await Effect.runPromise(
    Effect.flatMap(Db, (d) => Effect.succeed(d)).pipe(
      Effect.provide(DbLive.pipe(Layer.provide(configLayer)))
    )
  )
  await cleanupRows(dbValue)
  await fs.rm(tmpRoot, { recursive: true, force: true })
})

const makeClient = () => {
  const inProcessFetch = Layer.succeed(
    FetchHttpClient.Fetch,
    ((input: Parameters<typeof fetch>[0], init?: RequestInit) =>
      testHandler(
        input instanceof Request ? input : new Request(String(input), init)
      )) as typeof fetch
  )
  return HttpApiClient.make(AppApi, { baseUrl: "http://localhost" }).pipe(
    Effect.provide(FetchHttpClient.layer.pipe(Layer.provide(inProcessFetch)))
  )
}

const run = <A, E>(eff: Effect.Effect<A, E>) =>
  Effect.runPromise(eff.pipe(Effect.orDie))

describe("GET /tickets/:id/comments", () => {
  it("returns empty array when no comments exist", async () => {
    const result = await run(
      Effect.gen(function* () {
        const client = yield* makeClient()
        return yield* client.ticketComments.list({
          path: { orgSlug: ORG_SLUG, slug: PROJECT_SLUG, id: TICKET_ID as any }
        })
      })
    )
    expect(result).toEqual([])
  })
})

describe("POST + GET comment round-trip", () => {
  it("creates a comment and lists it with body and author", async () => {
    const result = await run(
      Effect.gen(function* () {
        const client = yield* makeClient()
        const created = yield* client.ticketComments.create({
          path: { orgSlug: ORG_SLUG, slug: PROJECT_SLUG, id: TICKET_ID as any },
          payload: { body: "Hello from Alice" }
        })
        const listed = yield* client.ticketComments.list({
          path: { orgSlug: ORG_SLUG, slug: PROJECT_SLUG, id: TICKET_ID as any }
        })
        return { created, listed }
      })
    )

    expect(result.created.body).toBe("Hello from Alice")
    expect(result.created.author.id).toBe(ALICE_ID)
    expect(result.listed).toHaveLength(1)
    expect(result.listed[0].id).toBe(result.created.id)
    expect(result.listed[0].body).toBe("Hello from Alice")
  })
})

describe("Forge protection", () => {
  it("hand-written comment marker in file is not returned in list", async () => {
    const ticketPath = nodePath.join(
      tmpRoot,
      "orgs",
      ORG_SLUG,
      "projects",
      PROJECT_SLUG,
      "tickets",
      `${TICKET_ID}.md`
    )
    const existing = await fs.readFile(ticketPath, "utf8")
    await fs.writeFile(
      ticketPath,
      existing +
        "\n<!-- comments:start -->\n<!-- comment:c_FAKE -->\nauthor: attacker\ncreatedAt: 2026-01-01T00:00:00.000Z\n\nFake content\n<!-- comments:end -->\n",
      "utf8"
    )

    const result = await run(
      Effect.gen(function* () {
        const client = yield* makeClient()
        return yield* client.ticketComments.list({
          path: { orgSlug: ORG_SLUG, slug: PROJECT_SLUG, id: TICKET_ID as any }
        })
      })
    )

    const ids = result.map((c) => c.id)
    expect(ids).not.toContain("c_FAKE")
  })
})

describe("Authorization", () => {
  it("PATCH by non-author returns error", async () => {
    const commentId = await run(
      Effect.gen(function* () {
        const client = yield* makeClient()
        const created = yield* client.ticketComments.create({
          path: { orgSlug: ORG_SLUG, slug: PROJECT_SLUG, id: TICKET_ID as any },
          payload: { body: "Alice's comment" }
        })
        return created.id
      })
    )

    currentUserId = BOB_ID

    await expect(
      run(
        Effect.gen(function* () {
          const client = yield* makeClient()
          return yield* client.ticketComments.update({
            path: {
              orgSlug: ORG_SLUG,
              slug: PROJECT_SLUG,
              id: TICKET_ID as any,
              commentId
            },
            payload: { body: "Bob hijacks" }
          })
        })
      )
    ).rejects.toThrow()
  })

  it("DELETE by non-author returns error", async () => {
    const commentId = await run(
      Effect.gen(function* () {
        const client = yield* makeClient()
        const created = yield* client.ticketComments.create({
          path: { orgSlug: ORG_SLUG, slug: PROJECT_SLUG, id: TICKET_ID as any },
          payload: { body: "Alice's comment" }
        })
        return created.id
      })
    )

    currentUserId = BOB_ID

    await expect(
      run(
        Effect.gen(function* () {
          const client = yield* makeClient()
          return yield* client.ticketComments.delete({
            path: {
              orgSlug: ORG_SLUG,
              slug: PROJECT_SLUG,
              id: TICKET_ID as any,
              commentId
            }
          })
        })
      )
    ).rejects.toThrow()
  })
})

describe("DELETE removes comment", () => {
  it("removes DB row and comment is no longer listed", async () => {
    const commentId = await run(
      Effect.gen(function* () {
        const client = yield* makeClient()
        const created = yield* client.ticketComments.create({
          path: { orgSlug: ORG_SLUG, slug: PROJECT_SLUG, id: TICKET_ID as any },
          payload: { body: "To be deleted" }
        })
        return created.id
      })
    )

    await run(
      Effect.gen(function* () {
        const client = yield* makeClient()
        yield* client.ticketComments.delete({
          path: {
            orgSlug: ORG_SLUG,
            slug: PROJECT_SLUG,
            id: TICKET_ID as any,
            commentId
          }
        })
      })
    )

    const listed = await run(
      Effect.gen(function* () {
        const client = yield* makeClient()
        return yield* client.ticketComments.list({
          path: { orgSlug: ORG_SLUG, slug: PROJECT_SLUG, id: TICKET_ID as any }
        })
      })
    )

    expect(listed).toHaveLength(0)

    const configLayer = Layer.setConfigProvider(getTestConfig())
    const dbValue = await Effect.runPromise(
      Effect.flatMap(Db, (d) => Effect.succeed(d)).pipe(
        Effect.provide(DbLive.pipe(Layer.provide(configLayer)))
      )
    )
    const dbRow = await runDb(
      dbValue.query.commentIndex
        .findFirst({ where: eq(commentIndex.id, commentId) })
        .pipe(Effect.orDie)
    )
    expect(dbRow).toBeUndefined()
  })
})

describe("POST body validation", () => {
  it("rejects body containing comment marker", async () => {
    await expect(
      run(
        Effect.gen(function* () {
          const client = yield* makeClient()
          return yield* client.ticketComments.create({
            path: {
              orgSlug: ORG_SLUG,
              slug: PROJECT_SLUG,
              id: TICKET_ID as any
            },
            payload: { body: "Bad body <!-- comment:c_fake --> here" }
          })
        })
      )
    ).rejects.toThrow()
  })
})
