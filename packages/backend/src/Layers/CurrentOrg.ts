// CurrentOrg — resolves the user's role in the org named by the URL slug.
//
// Every org-scoped handler reads `path.orgSlug` from the parsed HttpApi
// path and calls `currentOrg.resolve(orgSlug, userId)`. The lookup joins
// `organization` and `member` filtered by `(slug, userId)`; missing rows
// (org doesn't exist, OR the caller isn't a member) collapse to a single
// `NotFound` so the wire never leaks "this org exists, you just can't
// see it" — that's a real info-leak in B2B SaaS contexts.
//
// One seam, future Host-header swap.
// ----------------------------------------------------------------------------
// The resolver takes `orgSlug` from a path-param argument today. When v2
// adds subdomain-per-org, the calling site swaps the path-param read for
// a `Host` header parse and passes the result here unchanged.
//
// Active-org session sync (T-06 spec).
// ----------------------------------------------------------------------------
// Deferred. URL is canonical for "which org?", and nothing in v1 reads
// `session.activeOrganizationId` server-side. The org switcher (T-08)
// will be the first consumer; sync gets added there.

import { and, eq, isNull } from "drizzle-orm"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { NotFound, Role } from "@projectproject/shared"
import { member, organization } from "../db/schema"
import { Db } from "../Services/Db"
import { CurrentOrg, type CurrentOrgShape } from "../Services/CurrentOrg"

const makeRole = Schema.decodeUnknownSync(Role)

export const CurrentOrgLive = Layer.effect(
  CurrentOrg,
  Effect.gen(function* () {
    const db = yield* Db

    const resolve = (
      orgSlug: string,
      userId: string
    ): Effect.Effect<
      { organizationId: string; orgSlug: string; role: Role },
      NotFound
    > =>
      db
        .select({
          organizationId: organization.id,
          role: member.role
        })
        .from(organization)
        .innerJoin(
          member,
          and(
            eq(member.organizationId, organization.id),
            eq(member.userId, userId)
          )
        )
        .where(
          and(eq(organization.slug, orgSlug), isNull(organization.deletedAt))
        )
        .limit(1)
        .pipe(
          Effect.orDie,
          Effect.flatMap((rows) =>
            rows[0]
              ? Effect.succeed({
                  organizationId: rows[0].organizationId,
                  orgSlug,
                  role: makeRole(rows[0].role)
                })
              : Effect.fail(new NotFound())
          )
        )

    return { resolve } satisfies CurrentOrgShape
  })
)
