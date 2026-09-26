import { it } from "@effect/vitest"
import { Db } from "@pp/db"
import { publishedProject } from "@pp/db/projectVisibility"
import { projectIndex } from "@pp/db/schema"
import { PgDialect } from "drizzle-orm/pg-core"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import { expect } from "vitest"

import { GitHub } from "../github/GitHub"
import { TicketDocs } from "../tickets/TicketDocs"
import * as TicketDocumentLock from "../tickets/ticketDocumentLock"
import { TicketIndex } from "../tickets/TicketIndex"
import { Users } from "../users/Users"
import { BannerPlaceholders } from "./BannerPlaceholders"
import { ProjectDocs } from "./ProjectDocs"
import { Projects } from "./Projects"
import { ProjectsLive } from "./ProjectsLive"

it("builds the public project visibility predicate", () => {
  const dialect = new PgDialect()
  expect(dialect.sqlToQuery(publishedProject()).sql).toBe(
    '("project_index"."published_at" is not null)'
  )
  expect(projectIndex.publishedAt).toBeDefined()
})

for (const scenario of [
  { projectRole: "pm", orgRole: null, allowed: true, queries: 4 },
  { projectRole: "developer", orgRole: "member", allowed: true, queries: 5 },
  { projectRole: null, orgRole: "admin", allowed: true, queries: 5 },
  { projectRole: null, orgRole: "member", allowed: false, queries: 4 }
] as const) {
  it.effect(
    `loads authorized project context once for ${scenario.projectRole}/${scenario.orgRole}`,
    () => {
      const calls: string[] = []
      const query = <A>(name: string, value: A) =>
        Effect.sync(() => {
          calls.push(name)
          return value
        })
      const layer = ProjectsLive.pipe(
        Layer.provide(TicketDocumentLock.layer),
        Layer.provide(
          Layer.mergeAll(
            Layer.succeed(Db, {
              query: {
                organization: {
                  findFirst: () => query("organization", { id: "org-1" })
                },
                projectIndex: {
                  findFirst: () =>
                    query("project", {
                      id: "project-1",
                      organizationId: "org-1"
                    })
                },
                projectMember: {
                  findFirst: () =>
                    query(
                      "project-member",
                      scenario.projectRole
                        ? { roleId: scenario.projectRole }
                        : undefined
                    )
                },
                member: {
                  findFirst: () =>
                    query(
                      "org-member",
                      scenario.orgRole ? { role: scenario.orgRole } : undefined
                    )
                }
              },
              select: () => ({
                from: () => {
                  const chain = {
                    innerJoin: () => chain,
                    where: () => ({ limit: () => query("integration", []) })
                  }
                  return chain
                }
              })
            } as never),
            Layer.succeed(SqlClient.SqlClient, {} as never),
            Layer.mock(BannerPlaceholders, {}),
            Layer.mock(ProjectDocs, {}),
            Layer.mock(TicketDocs, {}),
            Layer.mock(TicketIndex, {}),
            Layer.mock(Users, {}),
            Layer.mock(GitHub, {})
          )
        )
      )
      return Effect.gen(function* () {
        const projects = yield* Projects
        const result = yield* Effect.result(
          projects.getGithubIntegration("org", "user", "project")
        )
        expect(result._tag).toBe(scenario.allowed ? "Success" : "Failure")
        if (result._tag === "Failure")
          expect(result.failure._tag).toBe("NotFound")
        expect(calls).toHaveLength(scenario.queries)
        expect(calls.filter((name) => name === "project")).toHaveLength(1)
        expect(calls.includes("integration")).toBe(scenario.allowed)
      }).pipe(Effect.provide(layer))
    }
  )
}
