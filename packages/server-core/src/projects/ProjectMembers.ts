import { ProjectPolicy } from "@pp/access/policies"
import { Org } from "@pp/access/roles"
import { Db } from "@pp/db"
import {
  invitation,
  projectIndex,
  projectInviteGrant,
  projectMember
} from "@pp/db/schema"
import {
  AssignableRole,
  Forbidden,
  LastProjectPmBlocked,
  NotFound,
  paginateSorted,
  ProjectScope,
  Role,
  Validation,
  type ActivityActor,
  type AddMemberInput,
  type CursorPayload,
  type Member,
  type ProjectDetail
} from "@pp/shared"
import { and, eq } from "drizzle-orm"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import type * as Markdown from "../markdown/Markdown"
import * as TicketRewrites from "../tickets/TicketRewrites"
import * as Users from "../users/Users"
import * as ProjectDetails from "./ProjectDetails"
import { issueProjectInvite } from "./projectInvite"
import { annotateProjectTelemetry } from "./projectTelemetry"
import { syncProjectInvite } from "./syncProjectInvite"

const makeRole = Schema.decodeUnknownSync(Role)

export class ProjectMembers extends Context.Service<
  ProjectMembers,
  Readonly<{
    listMembersPaged: (
      cursor: CursorPayload | undefined,
      limit: number
    ) => Effect.Effect<
      Readonly<{ items: ReadonlyArray<Member>; nextCursor: string | null }>,
      never,
      ProjectScope
    >
    memberIds: () => Effect.Effect<ReadonlySet<string>, never, ProjectScope>
    addMember: (
      input: AddMemberInput
    ) => Effect.Effect<
      ProjectDetail,
      NotFound | Forbidden | Markdown.MarkdownError | LastProjectPmBlocked,
      ProjectScope
    >
    updateMember: (
      targetUserId: string,
      nextRole: AssignableRole
    ) => Effect.Effect<
      ProjectDetail,
      NotFound | Markdown.MarkdownError | LastProjectPmBlocked,
      ProjectScope
    >
    removeMember: (
      targetUserId: string
    ) => Effect.Effect<
      ProjectDetail,
      NotFound | Validation | Markdown.MarkdownError | LastProjectPmBlocked,
      ProjectScope | ActivityActor
    >
    leave: () => Effect.Effect<
      void,
      NotFound | LastProjectPmBlocked,
      ProjectScope | ActivityActor
    >
    cancelPendingMember: (
      invitationId: string
    ) => Effect.Effect<
      ProjectDetail,
      NotFound | Markdown.MarkdownError,
      ProjectScope
    >
  }>
>()("@pp/server-core/projects/ProjectMembers") {}

const make = Effect.gen(function* () {
  const db = yield* Db
  const users = yield* Users.Users
  const rewrites = yield* TicketRewrites.TicketRewrites
  const {
    withWriteLock: withProjectWriteLock,
    current: inScope,
    members: loadMembers,
    replay: replayDetail
  } = yield* ProjectDetails.ProjectDetails

  const listMembersPaged = Effect.fn("ProjectMembers.listMembersPaged")(
    function* (cursor: CursorPayload | undefined, limit: number) {
      const { projectId } = yield* ProjectScope
      const members = yield* loadMembers(projectId)
      const sorted = [...members].toSorted((a, b) =>
        a.name < b.name
          ? -1
          : a.name > b.name
            ? 1
            : a.id < b.id
              ? -1
              : a.id > b.id
                ? 1
                : 0
      )
      return paginateSorted(sorted, {
        cursor,
        limit,
        sortKey: (m) => m.name,
        id: (m) => m.id
      })
    }
  )

  const memberIds = Effect.fn("ProjectMembers.memberIds")(function* () {
    const scope = yield* ProjectScope
    return yield* db.query.projectMember
      .findMany({
        columns: { userId: true },
        where: { projectId: scope.projectId }
      })
      .pipe(
        Effect.map(
          (rows): ReadonlySet<string> => new Set(rows.map((row) => row.userId))
        ),
        Effect.orDie
      )
  })

  const lockProjectForGrants = (projectId: string) =>
    db
      .select({ id: projectIndex.id })
      .from(projectIndex)
      .where(eq(projectIndex.id, projectId))
      .for("share")
      .pipe(Effect.orDie)

  const pmCount = (projectId: string): Effect.Effect<number> =>
    db.query.projectMember
      .findMany({
        columns: { userId: true },
        where: {
          RAW: (table, _operators) =>
            _operators.and(
              _operators.eq(table.projectId, projectId),
              _operators.eq(table.roleId, "pm")
            )!
        }
      })
      .pipe(
        Effect.map((rows) => rows.length),
        Effect.orDie
      )

  const memberRole = (
    projectId: string,
    targetUserId: string
  ): Effect.Effect<Role | null> =>
    db.query.projectMember
      .findFirst({
        columns: { roleId: true },
        where: {
          RAW: (table, _operators) =>
            _operators.and(
              _operators.eq(table.projectId, projectId),
              _operators.eq(table.userId, targetUserId)
            )!
        }
      })
      .pipe(
        Effect.map((row) => (row ? makeRole(row.roleId) : null)),
        Effect.orDie
      )

  const requireAnotherPm = (
    indexRow: typeof projectIndex.$inferSelect,
    targetRole: Role
  ): Effect.Effect<void, LastProjectPmBlocked> =>
    Effect.gen(function* () {
      if (targetRole !== "pm") return
      if ((yield* pmCount(indexRow.id)) > 1) return
      return yield* new LastProjectPmBlocked({
        projectSlugs: [indexRow.slug]
      })
    })

  const addMember = Effect.fn("ProjectMembers.addMember")(function* (
    input: AddMemberInput
  ) {
    const scope = yield* ProjectScope
    const { orgSlug, slug, userId } = scope
    return yield* annotateProjectTelemetry(
      "addMember",
      orgSlug,
      { slug, userId, targetEmail: input.email, targetRole: input.role },
      Effect.gen(function* () {
        const { indexRow } = yield* inScope
        const email = input.email.trim().toLowerCase()
        const target = yield* users.findByEmail(email)
        const targetOrgMember =
          target === null
            ? null
            : yield* db.query.member
                .findFirst({
                  columns: { id: true },
                  where: {
                    RAW: (table, _operators) =>
                      _operators.and(
                        _operators.eq(
                          table.organizationId,
                          indexRow.organizationId
                        ),
                        _operators.eq(table.userId, target.id)
                      )!
                  }
                })
                .pipe(Effect.orDie)

        if (target === null || targetOrgMember == null) {
          if (
            !ProjectPolicy.canInviteOutsider(
              scope,
              Org.orgRoles[scope.orgRole],
              input.role
            )
          ) {
            return yield* new Forbidden()
          }
          yield* issueProjectInvite(db, {
            organizationId: indexRow.organizationId,
            orgSlug,
            projectId: indexRow.id,
            inviterId: userId,
            email,
            role: input.role
          })
          return yield* replayDetail
        }

        yield* withProjectWriteLock(
          indexRow.id,
          Effect.gen(function* () {
            const currentRole = yield* memberRole(indexRow.id, target.id)
            if (currentRole === null) {
              yield* db
                .insert(projectMember)
                .values({
                  projectId: indexRow.id,
                  organizationId: indexRow.organizationId,
                  userId: target.id,
                  roleId: input.role
                })
                .pipe(Effect.orDie)
            } else if (currentRole !== input.role) {
              yield* requireAnotherPm(indexRow, currentRole)
              yield* db
                .update(projectMember)
                .set({ roleId: input.role })
                .where(
                  and(
                    eq(projectMember.projectId, indexRow.id),
                    eq(projectMember.userId, target.id)
                  )
                )
                .pipe(Effect.orDie)
            }
          })
        )

        return yield* replayDetail
      })
    )
  })

  const cancelPendingMember = Effect.fn("ProjectMembers.cancelPendingMember")(
    function* (invitationId: string) {
      const scope = yield* ProjectScope
      const { orgSlug, slug, userId } = scope
      return yield* annotateProjectTelemetry(
        "cancelPendingMember",
        orgSlug,
        { slug, userId, invitationId },
        Effect.gen(function* () {
          const { indexRow } = yield* inScope
          yield* db
            .transaction(() =>
              Effect.gen(function* () {
                yield* lockProjectForGrants(indexRow.id)
                const [pending] = yield* db
                  .select({
                    status: invitation.status,
                    role: invitation.role,
                    fromProject: invitation.fromProject
                  })
                  .from(invitation)
                  .innerJoin(
                    projectInviteGrant,
                    and(
                      eq(projectInviteGrant.invitationId, invitation.id),
                      eq(projectInviteGrant.projectId, indexRow.id)
                    )
                  )
                  .where(eq(invitation.id, invitationId))
                  .limit(1)
                  .for("update", { of: invitation })
                  .pipe(Effect.orDie)
                if (!pending || pending.status !== "pending") {
                  return yield* new NotFound()
                }
                yield* db
                  .delete(projectInviteGrant)
                  .where(
                    and(
                      eq(projectInviteGrant.projectId, indexRow.id),
                      eq(projectInviteGrant.invitationId, invitationId)
                    )
                  )
                  .pipe(Effect.orDie)
                if (pending.fromProject) {
                  return yield* syncProjectInvite(db, invitationId)
                }
                const remaining = yield* db.query.projectInviteGrant
                  .findFirst({
                    columns: { invitationId: true },
                    where: {
                      RAW: (table, _operators) =>
                        _operators.eq(table.invitationId, invitationId)
                    }
                  })
                  .pipe(Effect.orDie)
                const cancelsInvite =
                  !remaining &&
                  ProjectPolicy.canCancelInvitation(
                    Org.orgRoles[scope.orgRole],
                    pending.role
                  )
                return yield* cancelsInvite
                  ? db
                      .update(invitation)
                      .set({ status: "canceled" })
                      .where(eq(invitation.id, invitationId))
                      .pipe(Effect.asVoid, Effect.orDie)
                  : Effect.void
              })
            )
            .pipe(Effect.catchTag("SqlError", Effect.die))
          return yield* replayDetail
        })
      )
    }
  )

  const updateMember = Effect.fn("ProjectMembers.updateMember")(function* (
    targetUserId: string,
    nextRole: AssignableRole
  ) {
    const { orgSlug, slug, userId } = yield* ProjectScope
    return yield* annotateProjectTelemetry(
      "updateMember",
      orgSlug,
      { slug, userId, targetUserId, nextRole },
      Effect.gen(function* () {
        const { indexRow } = yield* inScope
        yield* withProjectWriteLock(
          indexRow.id,
          Effect.gen(function* () {
            const currentRole = yield* memberRole(indexRow.id, targetUserId)
            if (currentRole === null) return yield* new NotFound()
            if (currentRole !== nextRole) {
              yield* requireAnotherPm(indexRow, currentRole)
            }
            yield* db
              .update(projectMember)
              .set({ roleId: nextRole })
              .where(
                and(
                  eq(projectMember.projectId, indexRow.id),
                  eq(projectMember.userId, targetUserId)
                )
              )
              .pipe(Effect.orDie)
          })
        )
        return yield* replayDetail
      })
    )
  })

  const dropMember = (
    indexRow: typeof projectIndex.$inferSelect,
    orgSlug: string,
    slug: string,
    targetUserId: string,
    currentRole: Role
  ) =>
    Effect.gen(function* () {
      yield* requireAnotherPm(indexRow, currentRole)
      const removed = yield* withProjectWriteLock(
        indexRow.id,
        Effect.gen(function* () {
          const lockedRole = yield* memberRole(indexRow.id, targetUserId)
          if (lockedRole === null) return false
          yield* requireAnotherPm(indexRow, lockedRole)
          yield* db
            .delete(projectMember)
            .where(
              and(
                eq(projectMember.projectId, indexRow.id),
                eq(projectMember.userId, targetUserId)
              )
            )
            .pipe(Effect.orDie)
          return true
        })
      )
      if (removed) {
        yield* rewrites.unassignUserFromActiveTickets(
          orgSlug,
          slug,
          targetUserId
        )
      }
    })

  const removeMember = Effect.fn("ProjectMembers.removeMember")(function* (
    targetUserId: string
  ) {
    const { orgSlug, slug, userId } = yield* ProjectScope
    return yield* annotateProjectTelemetry(
      "removeMember",
      orgSlug,
      { slug, userId, targetUserId },
      Effect.gen(function* () {
        if (targetUserId === userId) {
          return yield* new Validation({ reason: "remove_self" })
        }
        const { indexRow } = yield* inScope
        const currentRole = yield* memberRole(indexRow.id, targetUserId)
        if (currentRole === null) return yield* new NotFound()
        yield* dropMember(indexRow, orgSlug, slug, targetUserId, currentRole)
        return yield* replayDetail
      })
    )
  })

  const leave = Effect.fn("ProjectMembers.leave")(function* () {
    const { orgSlug, slug, userId } = yield* ProjectScope
    return yield* annotateProjectTelemetry(
      "leave",
      orgSlug,
      { slug, userId },
      Effect.gen(function* () {
        const { indexRow } = yield* inScope
        const currentRole = yield* memberRole(indexRow.id, userId)
        if (currentRole === null) return yield* new NotFound()
        return yield* dropMember(indexRow, orgSlug, slug, userId, currentRole)
      })
    )
  })

  return ProjectMembers.of({
    listMembersPaged,
    memberIds,
    addMember,
    updateMember,
    removeMember,
    leave,
    cancelPendingMember
  })
})

export const layer = Layer.effect(ProjectMembers, make)
