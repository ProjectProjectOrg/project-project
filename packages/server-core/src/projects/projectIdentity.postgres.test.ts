// @effect-diagnostics-next-line nodeBuiltinImport:off
import { randomUUID } from "node:crypto"

import { it } from "@effect/vitest"
import { migrationsFolder } from "@pp/db"
import {
  CreatableProjectKey,
  CurrentUser,
  OrgScope,
  ProjectScope
} from "@pp/shared"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import * as Effect from "effect/Effect"
import type * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { Pool } from "pg"
import { afterAll, beforeAll, beforeEach, describe, expect } from "vitest"

import * as Access from "../access/Access"
import { testUser } from "../access/testing"
import * as TicketIndex from "../tickets/TicketIndex"
import * as Projects from "./Projects"
import { projectsOnPostgres } from "./projectsOnPostgres"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL
const projectKey = Schema.decodeSync(CreatableProjectKey)

describe.skipIf(!databaseUrl)("project identity per org", () => {
  const allOrgs: Array<string> = []
  const allUsers: Array<string> = []
  let orgs: Array<string> = []
  let users: Array<string> = []
  let pool: Pool
  let layer: Layer.Layer<
    Projects.Projects | TicketIndex.TicketIndex | Access.Access
  >

  const create = (index: number, name: string, key: string) =>
    Effect.flatMap(Projects.Projects, (projects) =>
      projects.create({ name, key: projectKey(key) })
    ).pipe(
      Effect.provideServiceEffect(
        OrgScope,
        Effect.flatMap(Access.Access, (access) => access.org(orgs[index])).pipe(
          Effect.provideService(CurrentUser, testUser(users[index]))
        )
      ),
      Effect.provide(layer)
    )

  const inProject = (index: number, orgIndex: number, slug: string) =>
    Effect.provideServiceEffect(
      ProjectScope,
      Effect.flatMap(Access.Access, (access) =>
        access.project(orgs[orgIndex], slug)
      ).pipe(Effect.provideService(CurrentUser, testUser(users[index])))
    )

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Test database URL is required")
    const url = new URL(databaseUrl)
    if (
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      !url.pathname.startsWith("/projectproject_effect_v4_")
    ) {
      throw new Error("Test requires an isolated local database")
    }
    pool = new Pool({ connectionString: databaseUrl })
    await migrate(drizzle({ client: pool }), { migrationsFolder })
  })

  beforeEach(async () => {
    const suffix = randomUUID().slice(0, 8)
    orgs = [`alpha-${suffix}`, `beta-${suffix}`]
    users = [randomUUID(), randomUUID()]
    allOrgs.push(...orgs)
    allUsers.push(...users)
    for (const [index, org] of orgs.entries()) {
      await pool.query(
        'INSERT INTO "user" (id,name,email,created_at,updated_at) VALUES ($1,$1,$2,now(),now())',
        [users[index], `${users[index]}@example.test`]
      )
      await pool.query(
        "INSERT INTO organization (id,name,slug,created_at) VALUES ($1,$1,$1,now())",
        [org]
      )
      await pool.query(
        "INSERT INTO member (id,organization_id,user_id,role,created_at) VALUES ($1,$2,$3,'member',now())",
        [randomUUID(), org, users[index]]
      )
    }
    layer = projectsOnPostgres(databaseUrl!, users)
  })

  afterAll(async () => {
    if (pool) {
      await pool.query("DELETE FROM organization WHERE id = ANY($1)", [allOrgs])
      await pool.query('DELETE FROM "user" WHERE id = ANY($1)', [allUsers])
      await pool.end()
    }
  })

  const websites = () =>
    Effect.all([create(0, "Website", "WEB"), create(1, "Website", "WEB")])

  it.effect(
    "gives two orgs the same slug for a project with the same name",
    () =>
      Effect.gen(function* () {
        const [alpha, beta] = yield* websites()
        expect([alpha.slug, beta.slug]).toStrictEqual(["website", "website"])
      })
  )

  it.effect("keeps slugs unique within an org", () =>
    Effect.gen(function* () {
      yield* create(0, "Website", "WEB")
      const again = yield* create(0, "Website", "SITE")
      expect(again.slug).toBe("website-2")
    })
  )

  it.effect("records synced former keys next to the current key", () =>
    Effect.gen(function* () {
      const { slug } = yield* create(0, "Site", "SITE")
      const index = yield* TicketIndex.TicketIndex
      const site = yield* index.projectFor(orgs[0], slug)
      yield* index.syncFormerKeys(site, ["OLD"])
      expect(yield* index.projectKeys(site)).toStrictEqual({
        current: "SITE",
        former: ["OLD"]
      })
    }).pipe(Effect.provide(layer))
  )

  it.effect(
    "refuses a new project whose key is another project's former key",
    () =>
      Effect.gen(function* () {
        const { slug } = yield* create(0, "Site", "SITE")
        yield* Effect.flatMap(TicketIndex.TicketIndex, (index) =>
          Effect.flatMap(index.projectFor(orgs[0], slug), (site) =>
            index.syncFormerKeys(site, ["OLD"])
          )
        ).pipe(Effect.provide(layer))
        const error = yield* Effect.flip(create(0, "Legacy", "OLD"))
        expect(error).toMatchObject({
          _tag: "Conflict",
          reason: "project_key_taken"
        })
      })
  )

  it.effect("resolves each org's own project", () =>
    Effect.gen(function* () {
      yield* websites()
      const projects = yield* Projects.Projects
      const index = yield* TicketIndex.TicketIndex
      const alpha = yield* projects.get().pipe(inProject(0, 0, "website"))
      const beta = yield* projects.get().pipe(inProject(1, 1, "website"))
      const alphaIndex = yield* index.projectFor(orgs[0], "website")
      const betaIndex = yield* index.projectFor(orgs[1], "website")
      expect(alpha.members.map((member) => member.id)).toStrictEqual([users[0]])
      expect(beta.members.map((member) => member.id)).toStrictEqual([users[1]])
      expect(alphaIndex.projectId).not.toBe(betaIndex.projectId)
      expect(alphaIndex.organizationId).toBe(orgs[0])
    }).pipe(Effect.provide(layer))
  )

  it.effect("keeps people out of the other org's project", () =>
    Effect.gen(function* () {
      yield* websites()
      const projects = yield* Projects.Projects
      const error = yield* Effect.flip(
        projects.get().pipe(inProject(0, 1, "website"))
      )
      expect(error._tag).toBe("NotFound")
    }).pipe(Effect.provide(layer))
  )

  it.effect("deletes one org's project without touching the other", () =>
    Effect.gen(function* () {
      yield* websites()
      const projects = yield* Projects.Projects
      yield* projects.remove().pipe(inProject(0, 0, "website"))
      const beta = yield* projects.get().pipe(inProject(1, 1, "website"))
      expect(beta.slug).toBe("website")
    }).pipe(Effect.provide(layer))
  )
})
