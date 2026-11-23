// @effect-diagnostics-next-line nodeBuiltinImport:off
import { randomUUID } from "node:crypto"

import { it } from "@effect/vitest"
import { migrationsFolder } from "@pp/db"
import { ProjectScope } from "@pp/shared"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import * as Effect from "effect/Effect"
import { Pool, type PoolClient } from "pg"
import { afterAll, beforeAll, describe, expect, vi } from "vitest"

import { projectScope } from "../access/testing"
import * as Projects from "./Projects"
import { projectsOnPostgres } from "./projectsOnPostgres"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

describe.skipIf(!databaseUrl)("project change notifications", () => {
  const id = randomUUID()
  const scope = projectScope("member", "pm", {
    userId: id,
    organizationId: id,
    projectId: id,
    orgSlug: id,
    slug: "project"
  })
  const heard: Array<unknown> = []
  let pool: Pool
  let listener: PoolClient

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
    await pool.query(
      'INSERT INTO "user" (id,name,email,created_at,updated_at) VALUES ($1,$1,$2,now(),now())',
      [id, `${id}@example.test`]
    )
    await pool.query(
      "INSERT INTO organization (id,name,slug,created_at) VALUES ($1,$1,$1,now())",
      [id]
    )
    await pool.query(
      "INSERT INTO project_index (id,organization_id,slug,key,name,icon,color,created_by) VALUES ($1,$2,'project','T','Project','folder','#3b82f6',$3)",
      [id, id, id]
    )
    listener = await pool.connect()
    listener.on("notification", ({ payload }) => {
      if (payload !== undefined) heard.push(JSON.parse(payload))
    })
    await listener.query("LISTEN project_sync")
  })

  afterAll(async () => {
    if (!pool) return
    listener.release()
    await pool.query("DELETE FROM organization WHERE id = $1", [id])
    await pool.query('DELETE FROM "user" WHERE id = $1', [id])
    await pool.end()
  })

  it.effect("notifies the project when only its links change", () =>
    Effect.gen(function* () {
      const projects = yield* Projects.Projects
      yield* projects.update({
        links: [{ label: "Docs", url: "https://example.com/docs" }]
      })
      yield* Effect.promise(() =>
        vi.waitFor(() =>
          expect(heard).toContainEqual({
            project: id,
            kind: "project",
            id: null
          })
        )
      )
    }).pipe(
      Effect.provideService(ProjectScope, scope),
      Effect.provide(projectsOnPostgres(databaseUrl ?? "", [id]))
    )
  )

  it.effect("notifies both sprints when a ticket moves between them", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        pool.query(
          "INSERT INTO ticket_index (organization_id,project_id,ticket_id,title,status,priority,rank,sprint_id,created_by,created_at,updated_at) VALUES ($1::text,$1::uuid,'T-1','Moved','todo','med','a','G-1',$1::text,now(),now())",
          [id]
        )
      )
      yield* Effect.promise(() =>
        vi.waitFor(() =>
          expect(heard).toContainEqual({
            project: id,
            kind: "sprints",
            id: "G-1"
          })
        )
      )
      heard.length = 0
      yield* Effect.promise(() =>
        pool.query(
          "UPDATE ticket_index SET sprint_id = 'G-2' WHERE project_id = $1 AND ticket_id = 'T-1'",
          [id]
        )
      )
      yield* Effect.promise(() =>
        vi.waitFor(() => {
          expect(heard).toContainEqual({
            project: id,
            kind: "sprints",
            id: "G-1"
          })
          expect(heard).toContainEqual({
            project: id,
            kind: "sprints",
            id: "G-2"
          })
        })
      )
    })
  )
})
