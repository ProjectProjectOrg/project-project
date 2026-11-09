import { ProjectPolicy } from "@pp/access/policies"
import type { Db } from "@pp/db"
import { invitation, projectIndex, projectInviteGrant } from "@pp/db/schema"
import { type AssignableRole, INVITATION_VALID_DAYS } from "@pp/shared"
import { and, eq, gt, sql as sqlFragment } from "drizzle-orm"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import { ulid } from "ulid"

import { syncProjectInvite } from "./syncProjectInvite"

export type ProjectInviteInput = Readonly<{
  organizationId: string
  orgSlug: string
  projectId: string
  inviterId: string
  email: string
  role: AssignableRole
}>

export const issueProjectInvite = (
  db: Db["Service"],
  input: ProjectInviteInput
): Effect.Effect<string> =>
  db
    .transaction(() =>
      Effect.gen(function* () {
        const normalizedEmail = input.email.toLowerCase()
        yield* db
          .select({ id: projectIndex.id })
          .from(projectIndex)
          .where(eq(projectIndex.id, input.projectId))
          .for("share")
          .pipe(Effect.orDie)
        yield* db
          .execute(
            sqlFragment`select pg_advisory_xact_lock(hashtextextended(${input.organizationId} || ':' || ${normalizedEmail}, 0))`
          )
          .pipe(Effect.orDie)
        const now = yield* DateTime.now
        const [existing] = yield* db
          .select({
            id: invitation.id,
            fromProject: invitation.fromProject
          })
          .from(invitation)
          .where(
            and(
              eq(invitation.organizationId, input.organizationId),
              eq(invitation.email, normalizedEmail),
              eq(invitation.status, "pending"),
              gt(invitation.expiresAt, DateTime.toDate(now))
            )
          )
          .limit(1)
          .for("update")
          .pipe(Effect.orDie)
        const invite =
          existing ??
          (yield* Effect.gen(function* () {
            const orgRole = ProjectPolicy.inviteOrgRole(input.role)
            const [created] = yield* db
              .insert(invitation)
              .values({
                id: yield* Effect.sync(() => ulid()),
                organizationId: input.organizationId,
                email: normalizedEmail,
                role: orgRole,
                fromProject: true,
                status: "pending",
                expiresAt: DateTime.toDate(
                  DateTime.add(now, { days: INVITATION_VALID_DAYS })
                ),
                inviterId: input.inviterId
              })
              .returning({
                id: invitation.id,
                fromProject: invitation.fromProject
              })
              .pipe(Effect.orDie)
            yield* Effect.logInfo("invitation issued").pipe(
              Effect.annotateLogs({
                orgSlug: input.orgSlug,
                role: orgRole,
                inviteId: created.id
              })
            )
            return created
          }))
        yield* db
          .insert(projectInviteGrant)
          .values({
            invitationId: invite.id,
            projectId: input.projectId,
            roleId: input.role
          })
          .onConflictDoUpdate({
            target: [
              projectInviteGrant.invitationId,
              projectInviteGrant.projectId
            ],
            set: { roleId: input.role }
          })
          .pipe(Effect.orDie)
        if (invite.fromProject) {
          yield* syncProjectInvite(db, invite.id)
        }
        return invite.id
      })
    )
    .pipe(Effect.catchTag("SqlError", Effect.die))
