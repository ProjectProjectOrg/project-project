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

import { and, eq } from "drizzle-orm"
import { Effect } from "effect"
import { NotFound, type Role } from "@projectproject/shared"
import { member, organization } from "../db/schema"
import { Db } from "./Db"

export class CurrentOrg extends Effect.Service<CurrentOrg>()("CurrentOrg", {
  effect: Effect.gen(function* () {
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
        .where(eq(organization.slug, orgSlug))
        .limit(1)
        .pipe(
          Effect.flatMap((rows) =>
            rows[0]
              ? Effect.succeed({
                  organizationId: rows[0].organizationId,
                  orgSlug,
                  role: rows[0].role as Role
                })
              : Effect.fail(new NotFound())
          ),
          Effect.orDie
        ) as Effect.Effect<
        { organizationId: string; orgSlug: string; role: Role },
        NotFound
      >

    return { resolve } as const
  })
}) {}
