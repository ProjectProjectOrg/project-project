import { randomUUID } from "node:crypto"

import { it } from "@effect/vitest"
import { migrationsFolder } from "@pp/db"
import { Slug } from "@pp/shared"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import * as Effect from "effect/Effect"
import type * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect } from "vitest"

import type { TicketIndex } from "../tickets/TicketIndex"
import { Projects } from "./Projects"
import { projectsOnPostgres } from "./projectsOnPostgres"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

describe.skipIf(!databaseUrl)("project members", () => {
  const organizationId = randomUUID()
  const orgSlug = `members-${organizationId}`
  const projectId = randomUUID()
  const slug = Schema.decodeSync(Slug)(`members-${projectId}`)
  const pm = randomUUID()
  const second = randomUUID()
  const developer = randomUUID()
  const users = [pm, second, developer]
  let pool: Pool
  let projectsLayer: Layer.Layer<Projects | TicketIndex>

  const run = <A, E>(
    f: (projects: Projects["Service"]) => Effect.Effect<A, E>
  ) => Effect.flatMap(Projects, f).pipe(Effect.provide(projectsLayer))

  const roles = () =>
    run((projects) => projects.get(orgSlug, pm, slug)).pipe(
      Effect.map((detail) =>
        Object.fromEntries(detail.members.map((m) => [m.id, m.role]))
      )
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
    for (const id of users) {
      await pool.query(
        'INSERT INTO "user" (id,name,email,created_at,updated_at) VALUES ($1,$1,$2,now(),now())',
        [id, `${id}@example.test`]
      )
    }
    await pool.query(
      "INSERT INTO organization (id,name,slug,created_at) VALUES ($1,$1,$2,now())",
      [organizationId, orgSlug]
    )
    for (const id of users) {
      await pool.query(
        "INSERT INTO member (id,organization_id,user_id,role,created_at) VALUES ($1,$2,$3,'member',now())",
        [randomUUID(), organizationId, id]
      )
    }
    await pool.query(
      "INSERT INTO project_index (id,slug,organization_id,key,name,icon,color,created_by) VALUES ($1,$2,$3,'MEM','Members','folder','#3b82f6',$4)",
      [projectId, slug, organizationId, pm]
    )
    await pool.query(
      "INSERT INTO project_member (project_id,organization_id,user_id,role_id) VALUES ($1,$2,$3,'pm')",
      [projectId, organizationId, pm]
    )

    projectsLayer = projectsOnPostgres(databaseUrl, users)
  })

  afterAll(async () => {
    if (pool) {
      await pool.query("DELETE FROM organization WHERE id=$1", [organizationId])
      await pool.query('DELETE FROM "user" WHERE id = ANY($1)', [users])
      await pool.end()
    }
  })

  it.effect("adds org members as developer and promotes them to pm", () =>
    Effect.gen(function* () {
      yield* run((projects) =>
        projects.addMember(orgSlug, pm, slug, {
          email: `${developer}@example.test`,
          role: "developer"
        })
      )
      yield* run((projects) =>
        projects.addMember(orgSlug, pm, slug, {
          email: `${second}@example.test`,
          role: "developer"
        })
      )
      yield* run((projects) =>
        projects.updateMember(orgSlug, pm, slug, second, "pm")
      )
      expect(yield* roles()).toStrictEqual({
        [pm]: "pm",
        [second]: "pm",
        [developer]: "developer"
      })
    })
  )

  it.effect("keeps developers out of member management", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        run((projects) =>
          projects.updateMember(orgSlug, developer, slug, second, "developer")
        )
      )
      expect(error._tag).toBe("Forbidden")
    })
  )

  it.effect("lets a pm step down while another pm remains", () =>
    Effect.gen(function* () {
      yield* run((projects) =>
        projects.updateMember(orgSlug, second, slug, pm, "developer")
      )
      yield* run((projects) =>
        projects.updateMember(orgSlug, second, slug, pm, "pm")
      )
      yield* run((projects) => projects.removeMember(orgSlug, pm, slug, second))
      expect((yield* roles())[pm]).toBe("pm")
    })
  )

  it.effect("never demotes or removes the last pm", () =>
    Effect.gen(function* () {
      const demote = yield* Effect.flip(
        run((projects) =>
          projects.updateMember(orgSlug, pm, slug, pm, "developer")
        )
      )
      const remove = yield* Effect.flip(
        run((projects) => projects.removeMember(orgSlug, pm, slug, pm))
      )
      expect(demote).toMatchObject({
        _tag: "LastProjectPmBlocked",
        projectSlugs: [slug]
      })
      expect(remove).toMatchObject({ _tag: "LastProjectPmBlocked" })
    })
  )

  it.effect("ends project access when the org membership goes", () =>
    Effect.gen(function* () {
      yield* run((projects) => projects.requireMember(orgSlug, developer, slug))
      yield* Effect.promise(() =>
        pool.query(
          "DELETE FROM member WHERE organization_id=$1 AND user_id=$2",
          [organizationId, developer]
        )
      )
      const error = yield* Effect.flip(
        run((projects) => projects.requireMember(orgSlug, developer, slug))
      )
      expect(error._tag).toBe("NotFound")
    })
  )
})
