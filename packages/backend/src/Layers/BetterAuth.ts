import { Effect, Layer } from "effect"
import { drizzle } from "drizzle-orm/node-postgres"
import { and, eq } from "drizzle-orm"
import { auth } from "../auth"
import * as schema from "../db/schema"
import { account, organization } from "../db/schema"
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
          if (!row?.accessToken) return yield* Effect.fail(new NoGithubToken())
          return row.accessToken
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
