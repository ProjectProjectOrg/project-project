import { Effective } from "@pp/access/roles"
import { projectIndex, projectMember } from "@pp/db/schema"
import { Role, type OrgScope, type ProjectScope } from "@pp/shared"
import { and, eq } from "drizzle-orm"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

const decodeRole = Schema.decodeUnknownEffect(Schema.NullOr(Role))

export const projectMemberOf = (scope: OrgScope["Service"]) =>
  and(
    eq(projectMember.projectId, projectIndex.id),
    eq(projectMember.userId, scope.userId)
  )

export const projectScopeOf = (
  scope: OrgScope["Service"],
  row: Readonly<{ projectId: string; slug: string; role: string | null }>
): Effect.Effect<Option.Option<ProjectScope["Service"]>> =>
  decodeRole(row.role).pipe(
    Effect.orDie,
    Effect.map((role) =>
      Option.map(Effective.roleOnProject(scope.role, role), (permissions) => ({
        userId: scope.userId,
        organizationId: scope.organizationId,
        orgSlug: scope.orgSlug,
        orgRole: scope.role,
        projectId: row.projectId,
        slug: row.slug,
        role,
        permissions
      }))
    )
  )
