import { Db } from "@pp/db"
import { publishedProject } from "@pp/db/projectVisibility"
import {
  organization,
  organizationGithubIntegration,
  organizationIntegration,
  projectGithubRepository,
  projectIndex,
  projectIntegrationLink
} from "@pp/db/schema"
import { ActivityActor } from "@pp/shared"
import { and, asc, eq, inArray, isNull } from "drizzle-orm"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"

import * as TicketRewrites from "../tickets/TicketRewrites"

export const legacyRepositoryForProject = Effect.fn(
  "legacyRepositoryForProject"
)(function* (projectId: string) {
  const db = yield* Db
  const [repository] = yield* db
    .select({
      projectId: projectIntegrationLink.projectId,
      integrationId: projectIntegrationLink.organizationIntegrationId,
      repoId: projectGithubRepository.repoId
    })
    .from(projectIntegrationLink)
    .innerJoin(
      projectGithubRepository,
      eq(
        projectGithubRepository.projectIntegrationLinkId,
        projectIntegrationLink.id
      )
    )
    .innerJoin(
      organizationIntegration,
      eq(
        organizationIntegration.id,
        projectIntegrationLink.organizationIntegrationId
      )
    )
    .innerJoin(
      organizationGithubIntegration,
      eq(
        organizationGithubIntegration.organizationIntegrationId,
        organizationIntegration.id
      )
    )
    .where(
      and(
        eq(projectIntegrationLink.projectId, projectId),
        eq(projectIntegrationLink.provider, "github"),
        inArray(projectIntegrationLink.status, ["active", "broken"]),
        inArray(projectGithubRepository.status, ["active", "broken"]),
        inArray(organizationIntegration.status, ["active", "broken"])
      )
    )
    .orderBy(
      asc(projectIntegrationLink.connectedAt),
      asc(projectIntegrationLink.id)
    )
    .limit(1)
    .pipe(Effect.orDie)
  return repository ?? null
})

export const backfillRepositories = Effect.fn("backfillRepositories")(
  function* (integrationIds?: ReadonlyArray<string>) {
    const db = yield* Db
    const rewrites = yield* TicketRewrites.TicketRewrites
    const projects = yield* db
      .select({
        id: projectIndex.id,
        orgSlug: organization.slug,
        slug: projectIndex.slug
      })
      .from(projectIndex)
      .innerJoin(organization, eq(organization.id, projectIndex.organizationId))
      .where(and(publishedProject(), isNull(organization.deletedAt)))
      .orderBy(asc(organization.slug), asc(projectIndex.slug))
      .pipe(Effect.orDie)
    return yield* Effect.forEach(projects, (project) =>
      Effect.gen(function* () {
        const repo = yield* legacyRepositoryForProject(project.id)
        if (
          integrationIds !== undefined &&
          (!repo || !integrationIds.includes(repo.integrationId))
        ) {
          return null
        }
        const stamped = repo
          ? yield* rewrites.stampRepository(
              project.orgSlug,
              project.slug,
              repo.repoId
            )
          : 0
        return {
          orgSlug: project.orgSlug,
          slug: project.slug,
          repoId: repo?.repoId ?? null,
          stamped
        }
      }).pipe(
        Effect.catchCause((cause) =>
          integrationIds !== undefined || Cause.hasInterrupts(cause)
            ? Effect.failCause(cause)
            : Effect.logError(
                "GitHub ticket repository backfill failed for project",
                cause
              ).pipe(
                Effect.annotateLogs({
                  orgSlug: project.orgSlug,
                  slug: project.slug
                }),
                Effect.as(null)
              )
        )
      )
    ).pipe(
      Effect.map((projects) => projects.filter((project) => project !== null)),
      Effect.provideService(ActivityActor, ActivityActor.system("github"))
    )
  }
)
