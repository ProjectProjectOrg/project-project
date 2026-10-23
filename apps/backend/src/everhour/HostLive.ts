import { Db } from "@pp/db"
import { publishedProject } from "@pp/db/projectVisibility"
import { organization, projectIndex, projectMember } from "@pp/db/schema"
import { EverhourHost } from "@pp/integration-everhour/Host"
import { Access } from "@pp/server-core/access/Access"
import { GroupDocs } from "@pp/server-core/groups/GroupDocs"
import { SecretCrypto } from "@pp/server-core/storage/SecretCrypto"
import { TicketDocs } from "@pp/server-core/tickets/TicketDocs"
import { TicketIndex } from "@pp/server-core/tickets/TicketIndex"
import { EverhourConfigMissing, NotFound } from "@pp/shared"
import { and, eq, isNull } from "drizzle-orm"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

export const EverhourHostLive = Layer.effect(
  EverhourHost,
  Effect.gen(function* () {
    const db = yield* Db
    const access = yield* Access
    const ticketIndex = yield* TicketIndex
    const groupDocs = yield* GroupDocs
    const ticketDocs = yield* TicketDocs
    const secrets = yield* SecretCrypto
    const sprints: EverhourHost["Service"]["sprints"] = Effect.fn(
      "EverhourHost.sprints"
    )(function* (orgSlug, slug) {
      const ids = yield* groupDocs.listIds(orgSlug, slug).pipe(Effect.orDie)
      const groups = yield* Effect.forEach(
        ids,
        (id) =>
          groupDocs.read(orgSlug, slug, id).pipe(
            Effect.catchTag("NotFound", () => Effect.succeed(null)),
            Effect.orDie
          ),
        { concurrency: 8 }
      )
      return groups.flatMap((group) =>
        group !== null && group.kind === "sprint"
          ? [
              {
                id: group.id,
                name: group.name,
                completed: group.completedAt !== null,
                tickets: group.tickets
              }
            ]
          : []
      )
    })
    return EverhourHost.of({
      project: (orgSlug, slug) =>
        ticketIndex.projectFor(orgSlug, slug).pipe(
          Effect.orDie,
          Effect.map(({ projectId, organizationId }) => ({
            projectId,
            organizationId
          }))
        ),
      publishedName: (projectId) =>
        db.query.projectIndex
          .findFirst({
            columns: { name: true },
            where: {
              RAW: (table, _operators) =>
                _operators.and(
                  _operators.eq(table.id, projectId),
                  publishedProject(table)
                )!
            }
          })
          .pipe(
            Effect.orDie,
            Effect.flatMap((row) =>
              row ? Effect.succeed(row.name) : Effect.fail(new NotFound())
            )
          ),
      projectPath: (projectId) =>
        db
          .select({ orgSlug: organization.slug, slug: projectIndex.slug })
          .from(projectIndex)
          .innerJoin(
            organization,
            eq(organization.id, projectIndex.organizationId)
          )
          .where(
            and(
              eq(projectIndex.id, projectId),
              publishedProject(),
              isNull(organization.deletedAt)
            )
          )
          .limit(1)
          .pipe(
            Effect.orDie,
            Effect.map(([row]) => row ?? null)
          ),
      memberIds: (projectId) =>
        db
          .select({ userId: projectMember.userId })
          .from(projectMember)
          .where(eq(projectMember.projectId, projectId))
          .pipe(
            Effect.orDie,
            Effect.map((rows) => rows.map((row) => row.userId))
          ),
      sprints,
      ticketTitle: (orgSlug, slug, ticketId) =>
        ticketDocs.read(orgSlug, slug, ticketId).pipe(
          Effect.map((ticket) => ticket.title),
          Effect.orElseSucceed(() => null)
        ),
      timeReadableSlug: (projectId) =>
        access.projectsInOrg().pipe(
          Effect.map((scopes) => {
            const project = scopes.find(
              (scope) => scope.projectId === projectId
            )
            return project?.permissions.can({ time: ["read"] })
              ? project.slug
              : null
          })
        ),
      seal: (plaintext) =>
        secrets
          .seal(plaintext)
          .pipe(Effect.mapError(() => new EverhourConfigMissing())),
      open: (sealed) =>
        secrets
          .open(sealed)
          .pipe(Effect.mapError(() => new EverhourConfigMissing()))
    })
  })
)
