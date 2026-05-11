import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { drizzle } from "drizzle-orm/node-postgres"
import { and, eq } from "drizzle-orm"
import { auth } from "../auth"
import * as schema from "../db/schema"
import { account, member, organization } from "../db/schema"
import {
  BetterAuth,
  BetterAuthError,
  NoGithubToken,
  type BetterAuthShape
} from "../Services/BetterAuth"

export const BetterAuthLive = Layer.effect(
  BetterAuth,
  Effect.sync(() => {
    const db = drizzle(process.env.DATABASE_URL!, { schema })

    return {
      handler: (request) =>
        Effect.tryPromise({
          try: () => auth.handler(request),
          catch: (cause) => new BetterAuthError({ cause })
        }),
      getSession: (headers) =>
        Effect.tryPromise({
          try: () => auth.api.getSession({ headers }),
          catch: (cause) => new BetterAuthError({ cause })
        }),
      getGithubAccessToken: (userId) =>
        Effect.gen(function* () {
          const row = yield* Effect.tryPromise({
            try: () =>
              db.query.account.findFirst({
                columns: { accessToken: true },
                where: and(
                  eq(account.userId, userId),
                  eq(account.providerId, "github")
                )
              }),
            catch: (cause) => new BetterAuthError({ cause })
          })
          if (!row?.accessToken) return yield* new NoGithubToken()
          return row.accessToken
        }),
      listOrganizations: (userId) =>
        Effect.gen(function* () {
          const rows = yield* Effect.tryPromise({
            try: () =>
              db
                .select({ slug: organization.slug, role: member.role })
                .from(member)
                .innerJoin(organization, eq(member.organizationId, organization.id))
                .where(eq(member.userId, userId)),
            catch: (cause) => new BetterAuthError({ cause })
          })
          // `member.role` is a free-form text column in Better Auth's schema;
          // we coerce to the three-tier literal and drop anything unexpected.
          const allowed = new Set(["owner", "admin", "member"] as const)
          return rows.flatMap((r) =>
            allowed.has(r.role as "owner" | "admin" | "member")
              ? [{ orgSlug: r.slug, role: r.role as "owner" | "admin" | "member" }]
              : []
          )
        }),
      getOrgSlugById: (organizationId) =>
        Effect.gen(function* () {
          if (!organizationId) return null
          const row = yield* Effect.tryPromise({
            try: () =>
              db.query.organization.findFirst({
                columns: { slug: true },
                where: eq(organization.id, organizationId)
              }),
            catch: (cause) => new BetterAuthError({ cause })
          })
          return row?.slug ?? null
        })
    } satisfies BetterAuthShape
  })
)
