import { Db } from "@pp/db"
import { projectStatus } from "@pp/db/schema"
import { SlackHost } from "@pp/integration-slack/Host"
import { Access } from "@pp/server-core/access/Access"
import { GroupDocs } from "@pp/server-core/groups/GroupDocs"
import { SecretCrypto } from "@pp/server-core/storage/SecretCrypto"
import { TicketDocs } from "@pp/server-core/tickets/TicketDocs"
import { Users } from "@pp/server-core/users/Users"
import { CurrentUser, SlackError } from "@pp/shared"
import { and, eq } from "drizzle-orm"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"

export const SlackHostLive = Layer.effect(
  SlackHost,
  Effect.gen(function* () {
    const db = yield* Db
    const access = yield* Access
    const docs = yield* TicketDocs
    const groups = yield* GroupDocs
    const users = yield* Users
    const secrets = yield* SecretCrypto
    const ticketSummary: SlackHost["Service"]["ticketSummary"] = Effect.fn(
      "SlackHost.ticketSummary"
    )(function* (request) {
      const [viewer] = yield* users.fullByIds([request.userId])
      if (!viewer) return null
      const scope = yield* access
        .project(request.orgSlug, request.slug)
        .pipe(Effect.provideService(CurrentUser, viewer), Effect.option)
      if (
        Option.isNone(scope) ||
        scope.value.organizationId !== request.organizationId ||
        !scope.value.permissions.can({ ticket: ["read"] })
      )
        return null
      const ticket = yield* docs
        .read(request.orgSlug, request.slug, request.id)
        .pipe(Effect.option)
      if (Option.isNone(ticket) || ticket.value.archivedAt !== null) return null
      const [status] = yield* db
        .select({ label: projectStatus.label })
        .from(projectStatus)
        .where(
          and(
            eq(projectStatus.projectId, scope.value.projectId),
            eq(projectStatus.slug, ticket.value.status)
          )
        )
        .limit(1)
        .pipe(Effect.orDie)
      const assigned = yield* users.findManyByIds(ticket.value.assignees)
      return {
        id: ticket.value.id,
        title: ticket.value.title,
        status: status?.label ?? ticket.value.status,
        assignees: assigned.map((person) => person.name)
      }
    })
    const sprint: SlackHost["Service"]["sprint"] = Effect.fn(
      "SlackHost.sprint"
    )(function* ({ orgSlug, slug, id }) {
      const group = yield* groups.read(orgSlug, slug, id).pipe(
        Effect.catchTag("NotFound", () => Effect.succeed(null)),
        Effect.mapError(() => new SlackError({ reason: "sprint_unavailable" }))
      )
      return group?.kind === "sprint"
        ? { startsAt: group.startsAt, completed: group.completedAt !== null }
        : null
    })
    return SlackHost.of({
      ticketSummary,
      sprint,
      seal: (plaintext) =>
        secrets
          .seal(plaintext)
          .pipe(
            Effect.mapError(() => new SlackError({ reason: "encryption" }))
          ),
      open: (sealed) =>
        secrets
          .open(sealed)
          .pipe(Effect.mapError(() => new SlackError({ reason: "encryption" })))
    })
  })
)
