import { randomUUID } from "node:crypto"

import { PgClient } from "@effect/sql-pg"
import { it } from "@effect/vitest"
import { DbLive, migrationsFolder } from "@pp/db"
import {
  Conflict,
  ProjectScope,
  StatusSlug,
  type GitAutomation
} from "@pp/shared"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect } from "vitest"

import { projectScope } from "../access/testing"
import { ProjectGitAutomation } from "./ProjectGitAutomation"
import { ProjectGitAutomationLive } from "./ProjectGitAutomationLive"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL
const slug = Schema.decodeSync(StatusSlug)

const noRules: GitAutomation["rules"] = {
  branch_linked: null,
  pr_draft_opened: null,
  pr_opened: null,
  pr_merged: null,
  pr_closed: null,
  branch_deleted: null
}

describe.skipIf(!databaseUrl)("project git automation", () => {
  const id = randomUUID()
  const scope = projectScope("member", "pm", {
    userId: id,
    organizationId: id,
    projectId: id,
    orgSlug: id,
    slug: "project"
  })
  let pool: Pool
  let layer: Layer.Layer<ProjectGitAutomation>

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
    await pool.query(
      "INSERT INTO project_status (project_id,slug,label,icon,color,order_key,created_by) VALUES ($1,'todo','Todo','Circle','#a3a3a3','a0',$2), ($1,'in_review','In review','Eye','#e0a03b','a1',$2), ($1,'done','Done','CircleCheck','#22c55e','a2',$2)",
      [id, id]
    )
    layer = ProjectGitAutomationLive.pipe(
      Layer.provide(
        DbLive.pipe(
          Layer.provide(PgClient.layer({ url: Redacted.make(databaseUrl) }))
        )
      ),
      Layer.orDie
    )
  })

  afterAll(async () => {
    if (!pool) return
    await pool.query("DELETE FROM organization WHERE id = $1", [id])
    await pool.query('DELETE FROM "user" WHERE id = $1', [id])
    await pool.end()
  })

  const run = <A, E>(
    effect: Effect.Effect<A, E, ProjectGitAutomation | ProjectScope>
  ) =>
    effect.pipe(
      Effect.provideService(ProjectScope, scope),
      Effect.provide(layer)
    )

  it.effect(
    "saves the rules, follows status renames and drops rules with their status",
    () =>
      run(
        Effect.gen(function* () {
          const automation = yield* ProjectGitAutomation
          expect(yield* automation.get()).toEqual({
            rules: noRules,
            forwardOnly: true
          })

          const saved = yield* automation.update({
            rules: {
              ...noRules,
              pr_opened: slug("in_review"),
              pr_merged: slug("done")
            },
            forwardOnly: false
          })
          expect(saved).toEqual({
            rules: {
              ...noRules,
              pr_opened: "in_review",
              pr_merged: "done"
            },
            forwardOnly: false
          })

          expect(
            yield* automation.update({ rules: { pr_closed: slug("todo") } })
          ).toEqual({
            rules: {
              ...noRules,
              pr_opened: "in_review",
              pr_merged: "done",
              pr_closed: "todo"
            },
            forwardOnly: false
          })
          yield* automation.update({ rules: { pr_closed: null } })

          yield* Effect.promise(() =>
            pool.query(
              "UPDATE project_status SET slug = 'review' WHERE project_id = $1 AND slug = 'in_review'",
              [id]
            )
          )
          expect((yield* automation.get()).rules.pr_opened).toBe("review")

          yield* Effect.promise(() =>
            pool.query(
              "DELETE FROM project_status WHERE project_id = $1 AND slug = 'review'",
              [id]
            )
          )
          expect((yield* automation.get()).rules).toEqual({
            ...noRules,
            pr_merged: "done"
          })
        })
      )
  )

  it.effect("rejects a rule that points at a status the project lacks", () =>
    run(
      Effect.gen(function* () {
        const automation = yield* ProjectGitAutomation
        const failure = yield* Effect.flip(
          automation.update({
            rules: { ...noRules, pr_closed: slug("archived") },
            forwardOnly: true
          })
        )
        expect(failure).toEqual(new Conflict({ reason: "status_not_found" }))
      })
    )
  )
})
