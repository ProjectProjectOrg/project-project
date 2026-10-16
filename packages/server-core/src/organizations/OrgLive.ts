import { Db } from "@pp/db"
import { member, organization } from "@pp/db/schema"
import {
  Conflict,
  ORG_DELETE_GRACE_DAYS,
  type OrgDetail,
  OrgRole,
  OrgScope,
  type OrgScopeShape
} from "@pp/shared"
import { and, eq, isNull } from "drizzle-orm"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import { Org, type OrgShape } from "./Org"

const makeRole = Schema.decodeUnknownSync(OrgRole)

const purgeAtFor = (deletedAt: Date): Date =>
  DateTime.toDate(
    DateTime.add(DateTime.fromDateUnsafe(deletedAt), {
      days: ORG_DELETE_GRACE_DAYS
    })
  )

export const OrgLive = Layer.effect(
  Org,
  Effect.gen(function* () {
    const db = yield* Db

    const detail = (
      scope: OrgScopeShape,
      deletedAt: Date | null
    ): Effect.Effect<OrgDetail> =>
      db
        .select({ name: organization.name, createdAt: organization.createdAt })
        .from(organization)
        .where(eq(organization.id, scope.organizationId))
        .limit(1)
        .pipe(
          Effect.orDie,
          Effect.flatMap(([row]) =>
            row
              ? Effect.succeed({
                  id: scope.organizationId,
                  slug: scope.orgSlug,
                  name: row.name,
                  role: scope.role,
                  permissions: scope.permissions.grants,
                  createdAt: row.createdAt,
                  deletedAt,
                  purgeAt: deletedAt ? purgeAtFor(deletedAt) : null
                })
              : Effect.die("organization disappeared while in scope")
          )
        )

    const myOrgs: OrgShape["myOrgs"] = (userId) =>
      db
        .select({
          slug: organization.slug,
          name: organization.name,
          role: member.role
        })
        .from(member)
        .innerJoin(organization, eq(member.organizationId, organization.id))
        .where(and(eq(member.userId, userId), isNull(organization.deletedAt)))
        .pipe(
          Effect.orDie,
          Effect.map((rows) =>
            rows.map((row) => ({
              slug: row.slug,
              name: row.name,
              role: makeRole(row.role)
            }))
          )
        )

    const get: OrgShape["get"] = Effect.fn("Org.get")(function* () {
      const scope = yield* OrgScope
      return yield* detail(scope, scope.deletedAt)
    })

    const softDelete: OrgShape["softDelete"] = Effect.fn("Org.softDelete")(
      function* () {
        const scope = yield* OrgScope
        const now = DateTime.toDate(yield* DateTime.now)
        yield* db
          .update(organization)
          .set({ deletedAt: now })
          .where(
            and(
              eq(organization.id, scope.organizationId),
              isNull(organization.deletedAt)
            )
          )
          .pipe(Effect.orDie)
        return yield* detail(scope, now)
      }
    )

    const restore: OrgShape["restore"] = Effect.fn("Org.restore")(function* () {
      const scope = yield* OrgScope
      if (!scope.deletedAt) {
        return yield* new Conflict({ reason: "not_deleted" })
      }
      const nowMs = DateTime.toEpochMillis(yield* DateTime.now)
      if (nowMs > purgeAtFor(scope.deletedAt).getTime()) {
        return yield* new Conflict({ reason: "grace_expired" })
      }
      yield* db
        .update(organization)
        .set({ deletedAt: null })
        .where(
          and(
            eq(organization.id, scope.organizationId),
            eq(organization.deletedAt, scope.deletedAt)
          )
        )
        .pipe(Effect.orDie)
      return yield* detail(scope, null)
    })

    return { myOrgs, get, softDelete, restore } satisfies OrgShape
  })
)
