import { Db } from "@pp/db"
import { publishedProject } from "@pp/db/projectVisibility"
import {
  jiraIdentityClaim,
  organization,
  projectIndex,
  projectMember
} from "@pp/db/schema"
import * as TicketRewrites from "@pp/server-core/tickets/TicketRewrites"
import { ActivityActor } from "@pp/shared"
import { and, eq } from "drizzle-orm"
import * as Effect from "effect/Effect"

export const applyJiraIdentityClaims = Effect.fn(
  "JiraImport.applyIdentityClaims"
)(
  function* (
    input: Readonly<{ orgSlug: string; userId: string; email: string }>
  ) {
    const db = yield* Db
    const rewrites = yield* TicketRewrites.TicketRewrites
    const claims = yield* db
      .select({
        projectId: jiraIdentityClaim.projectId,
        email: jiraIdentityClaim.email,
        organizationId: projectIndex.organizationId,
        slug: projectIndex.slug,
        jiraAccountIds: jiraIdentityClaim.jiraAccountIds,
        assigneeTicketIds: jiraIdentityClaim.assigneeTicketIds,
        reporterTicketIds: jiraIdentityClaim.reporterTicketIds
      })
      .from(jiraIdentityClaim)
      .innerJoin(projectIndex, eq(projectIndex.id, jiraIdentityClaim.projectId))
      .innerJoin(organization, eq(organization.id, projectIndex.organizationId))
      .where(
        and(
          eq(organization.slug, input.orgSlug),
          eq(jiraIdentityClaim.email, input.email.toLowerCase()),
          publishedProject()
        )
      )
      .pipe(Effect.orDie)
    yield* Effect.forEach(
      claims,
      (claim) =>
        Effect.gen(function* () {
          yield* db
            .insert(projectMember)
            .values({
              projectId: claim.projectId,
              organizationId: claim.organizationId,
              userId: input.userId,
              roleId: "developer"
            })
            .onConflictDoNothing({
              target: [projectMember.projectId, projectMember.userId]
            })
            .pipe(Effect.orDie)
          const failed = new Set(
            yield* rewrites.claimJiraIdentity(input.orgSlug, claim.slug, {
              userId: input.userId,
              jiraAccountIds: claim.jiraAccountIds,
              assigneeTicketIds: claim.assigneeTicketIds,
              reporterTicketIds: claim.reporterTicketIds
            })
          )
          const thisClaim = and(
            eq(jiraIdentityClaim.projectId, claim.projectId),
            eq(jiraIdentityClaim.email, claim.email)
          )
          yield* (
            failed.size === 0
              ? db.delete(jiraIdentityClaim).where(thisClaim)
              : db
                  .update(jiraIdentityClaim)
                  .set({
                    assigneeTicketIds: claim.assigneeTicketIds.filter((id) =>
                      failed.has(id)
                    ),
                    reporterTicketIds: claim.reporterTicketIds.filter((id) =>
                      failed.has(id)
                    )
                  })
                  .where(thisClaim)
          ).pipe(Effect.orDie)
        }),
      { discard: true }
    )
  },
  Effect.provideService(ActivityActor, ActivityActor.system("import"))
)
