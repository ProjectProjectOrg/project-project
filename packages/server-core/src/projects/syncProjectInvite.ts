import { ProjectPolicy } from "@pp/access/policies"
import type { Db } from "@pp/db"
import { invitation, projectInviteGrant } from "@pp/db/schema"
import { Role } from "@pp/shared"
import { eq } from "drizzle-orm"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

const makeRole = Schema.decodeUnknownSync(Role)

export const syncProjectInvite = (db: Db["Service"], invitationId: string) =>
  Effect.gen(function* () {
    const grants = yield* db
      .select({ roleId: projectInviteGrant.roleId })
      .from(projectInviteGrant)
      .where(eq(projectInviteGrant.invitationId, invitationId))
      .pipe(Effect.orDie)
    const orgRole = ProjectPolicy.projectInviteOrgRole(
      grants.map((grant) => makeRole(grant.roleId))
    )
    yield* db
      .update(invitation)
      .set(
        Option.match(orgRole, {
          onNone: () => ({ status: "canceled" }),
          onSome: (role) => ({ role })
        })
      )
      .where(eq(invitation.id, invitationId))
      .pipe(Effect.orDie)
  })
