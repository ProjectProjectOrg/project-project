import { Effective, Org } from "@pp/access/roles"
import { Db } from "@pp/db"
import { publishedProject } from "@pp/db/projectVisibility"
import {
  member,
  organization,
  projectIndex,
  projectMember
} from "@pp/db/schema"
import { CurrentUser, NotFound, OrgRole, OrgScope, Role } from "@pp/shared"
import { and, eq, isNull, type SQL } from "drizzle-orm"
import * as Arr from "effect/Array"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

import { Access, type AccessShape } from "./Access"
import { projectMemberOf, projectScopeOf } from "./projectScope"

const decodeOrgRole = Schema.decodeUnknownEffect(OrgRole)

const decodeRole = Schema.decodeUnknownEffect(Schema.NullOr(Role))

export const AccessLive = Layer.effect(
  Access,
  Effect.gen(function* () {
    const db = yield* Db

    const org: AccessShape["org"] = Effect.fn("Access.org")(
      function* (orgSlug, lookup) {
        const user = yield* CurrentUser
        const [row] = yield* db
          .select({
            organizationId: organization.id,
            role: member.role,
            deletedAt: organization.deletedAt
          })
          .from(organization)
          .innerJoin(
            member,
            and(
              eq(member.organizationId, organization.id),
              eq(member.userId, user.id)
            )
          )
          .where(eq(organization.slug, orgSlug))
          .limit(1)
          .pipe(Effect.orDie)
        if (!row || (row.deletedAt !== null && !lookup?.includeDeleted)) {
          return yield* new NotFound()
        }
        const role = yield* decodeOrgRole(row.role).pipe(Effect.orDie)
        return {
          userId: user.id,
          organizationId: row.organizationId,
          orgSlug,
          role,
          deletedAt: row.deletedAt,
          permissions: Org.orgRoles[role]
        }
      }
    )

    const project: AccessShape["project"] = Effect.fn("Access.project")(
      function* (orgSlug, slug) {
        const user = yield* CurrentUser
        const [row] = yield* db
          .select({
            projectId: projectIndex.id,
            organizationId: organization.id,
            orgRole: member.role,
            role: projectMember.roleId
          })
          .from(projectIndex)
          .innerJoin(
            organization,
            and(
              eq(organization.id, projectIndex.organizationId),
              eq(organization.slug, orgSlug),
              isNull(organization.deletedAt)
            )
          )
          .innerJoin(
            member,
            and(
              eq(member.organizationId, organization.id),
              eq(member.userId, user.id)
            )
          )
          .leftJoin(
            projectMember,
            and(
              eq(projectMember.projectId, projectIndex.id),
              eq(projectMember.userId, user.id)
            )
          )
          .where(and(eq(projectIndex.slug, slug), publishedProject()))
          .limit(1)
          .pipe(Effect.orDie)
        if (!row) return yield* new NotFound()
        const orgRole = yield* decodeOrgRole(row.orgRole).pipe(Effect.orDie)
        const role = yield* decodeRole(row.role).pipe(Effect.orDie)
        const permissions = Effective.roleOnProject(orgRole, role)
        if (Option.isNone(permissions)) return yield* new NotFound()
        return {
          userId: user.id,
          organizationId: row.organizationId,
          orgSlug,
          orgRole,
          projectId: row.projectId,
          slug,
          role,
          permissions: permissions.value
        }
      }
    )

    const visibleProjectRows = (scope: OrgScope["Service"], where?: SQL) =>
      db
        .select({
          projectId: projectIndex.id,
          slug: projectIndex.slug,
          role: projectMember.roleId
        })
        .from(projectIndex)
        .leftJoin(projectMember, projectMemberOf(scope))
        .where(
          and(
            eq(projectIndex.organizationId, scope.organizationId),
            publishedProject(),
            where
          )
        )
        .pipe(Effect.orDie)

    const projectsInOrg: AccessShape["projectsInOrg"] = Effect.fn(
      "Access.projectsInOrg"
    )(function* () {
      const scope = yield* OrgScope
      const rows = yield* visibleProjectRows(scope)
      return yield* Effect.forEach(rows, (row) =>
        projectScopeOf(scope, row)
      ).pipe(Effect.map(Arr.getSomes))
    })

    const projectById: AccessShape["projectById"] = Effect.fn(
      "Access.projectById"
    )(function* (projectId) {
      const scope = yield* OrgScope
      const [row] = yield* visibleProjectRows(
        scope,
        eq(projectIndex.id, projectId)
      )
      return row === undefined
        ? Option.none()
        : yield* projectScopeOf(scope, row)
    })

    return { org, project, projectsInOrg, projectById } satisfies AccessShape
  })
)
