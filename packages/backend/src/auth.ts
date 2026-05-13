// packages/backend/src/auth.ts
//
// THE BETTER AUTH INSTANCE.
// ============================================================================
// This file is the single place where the Better Auth library is configured.
// It exports the configured `auth` instance (a plain object with `.handler`
// and `.api` namespaces) plus the inferred `User` and `Session` types.
//
// Everything else in the codebase touches Better Auth through the
// `BetterAuth` Effect service in `services/BetterAuth.ts` — *not* by
// importing `auth` directly. The exception is the Better Auth CLI, which
// reads this file at the command line to generate the Drizzle schema.
//
// WHY A SEPARATE DRIZZLE CLIENT FOR BETTER AUTH?
// ----------------------------------------------------------------------------
// The Effect `Db` service in `services/Db.ts` produces a Drizzle client
// inside Effect's Layer/Scope system. That client only exists while the
// surrounding scope is alive — it's resource-managed.
//
// Better Auth, being Promise-based and constructed at module load, can't
// participate in that scope. It needs a Drizzle client *now*, synchronously,
// at file evaluation time.
//
// Two choices:
//
//   (A) Stand up a second, simple Drizzle client here just for Better Auth.
//       Two pools share the same `DATABASE_URL`. Trivially cheap; clean.
//
//   (B) Hoist the Drizzle client out of `Db` into a top-level singleton and
//       have both this file and `Db` use it. This couples `Db`'s lifecycle to
//       module-load and undermines the resource management we set up in
//       Chapter 1.
//
// We're going with (A) — keep this file simple, pay one extra connection.
//
// CONFIG TO FILL IN
// ----------------------------------------------------------------------------
//   - database:        drizzleAdapter(db, { provider: "pg", schema: { user, session, account, verification } })
//   - secret:          process.env.BETTER_AUTH_SECRET
//   - baseURL:         process.env.BETTER_AUTH_URL
//   - trustedOrigins:  ["http://localhost:5173", "http://localhost:3000"]   (dev)
//   - socialProviders.github:
//       clientId, clientSecret from env, scope: ["read:user", "user:email", "repo"]
//   - session.cookieCache: { enabled: true, maxAge: 5 * 60 }
//
// EXPORTED TYPES
// ----------------------------------------------------------------------------
// After the instance is built:
//
//   export type User = typeof auth.$Infer.Session["user"]
//   export type Session = typeof auth.$Infer.Session["session"]
//
// These flow into `services/BetterAuth.ts` so the wrapper's signatures stay
// in sync with whatever Better Auth config we have here.
//
// USING `process.env` HERE IS FINE
// ----------------------------------------------------------------------------
// In Effect code we'd reach for `Config.redacted("FOO")` so missing env vars
// fail with a typed `ConfigError`. Here, we're outside any Effect runtime —
// `auth` is a top-level constant evaluated at import time. Plain `process.env`
// reads are appropriate. If a required var is missing, throwing at boot is
// the right behavior.

import { betterAuth } from "better-auth"
import { admin, mcp, organization } from "better-auth/plugins"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { createAuthMiddleware, getSessionFromCtx } from "better-auth/api"
import { drizzle } from "drizzle-orm/node-postgres"
import { and, eq } from "drizzle-orm"
import * as schema from "./db/schema"
import {
  account,
  invitation,
  member,
  oauthAccessToken,
  oauthApplication,
  oauthConsent,
  organization as organizationTable,
  session,
  user,
  verification
} from "./db/schema"

const db = drizzle(process.env.DATABASE_URL!, { schema })

// TODO: configure and export `auth`.
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user,
      session,
      account,
      verification,
      organization: organizationTable,
      member,
      invitation,
      oauthApplication,
      oauthAccessToken,
      oauthConsent
    }
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: ["http://localhost:5173", "http://localhost:3000"],
  // `username` is a human-readable handle used in markdown frontmatter and
  // the members UI. Better Auth's CLI doesn't know about it from the schema
  // alone — declaring it here lets `auth.api.updateUser` etc. round-trip
  // the field, and `mapProfileToUser` populates it from GitHub on sign-in.
  user: {
    additionalFields: {
      username: {
        type: "string",
        required: false,
        input: false,
        unique: true
      }
    }
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["github"]
    }
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      scope: ["read:user", "user:email", "repo"],
      // GitHub's `login` is the unique handle (e.g. "wouter-vh"). Fallback
      // to a slugified `name` if the profile is missing it (shouldn't happen
      // with the read:user scope, but defensive).
      mapProfileToUser: (profile: { login?: string; name?: string }) => ({
        username:
          profile.login?.toLowerCase() ??
          profile.name?.toLowerCase().replace(/\s+/g, "-")
      })
    }
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60
    }
  },
  // Better Auth's MCP plugin only honours `prompt=consent` on /mcp/authorize
  // — its own gate is `requireConsent: query.prompt === "consent"`, with no
  // first-time-consent check against the oauthConsent table. Without this
  // hook, every MCP client (Claude Code, MCP Inspector, ...) silently
  // exchanges a code for tokens and the user never sees a consent screen.
  // We inject `prompt=consent` when no oauthConsent row exists for this
  // (client, user) pair so the styled /oauth/consent page renders the first
  // time. Subsequent re-auths read the persisted row and stay silent.
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/mcp/authorize") return
      const clientId = (ctx.query as { client_id?: string } | undefined)
        ?.client_id
      if (!clientId) return
      const session = await getSessionFromCtx(ctx)
      if (!session) return
      const existing = await ctx.context.adapter.findOne<{
        consentGiven?: boolean
      }>({
        model: "oauthConsent",
        where: [
          { field: "clientId", value: clientId },
          { field: "userId", value: session.user.id }
        ]
      })
      if (existing?.consentGiven) return
      ctx.query = { ...ctx.query, prompt: "consent" }
    })
  },
  // On sign-in, return the user to the org they were last in. We persist
  // that on `user.lastActiveOrganizationId` (a column on the user table)
  // and capture it at sign-out time via the `session.delete.before` hook.
  // First-ever sign-in falls back to the user's first org membership.
  // Subsequent in-app org changes flow through the switcher (T-08) — never
  // via URL navigation.
  databaseHooks: {
    session: {
      create: {
        before: async (sessionData) => {
          const currentUser = await db.query.user.findFirst({
            columns: { lastActiveOrganizationId: true },
            where: eq(user.id, sessionData.userId)
          })
          let orgId = currentUser?.lastActiveOrganizationId ?? null
          if (orgId) {
            const stillMember = await db.query.member.findFirst({
              columns: { organizationId: true },
              where: and(
                eq(member.userId, sessionData.userId),
                eq(member.organizationId, orgId)
              )
            })
            if (!stillMember) orgId = null
          }
          if (!orgId) {
            const firstMembership = await db.query.member.findFirst({
              columns: { organizationId: true },
              where: eq(member.userId, sessionData.userId)
            })
            orgId = firstMembership?.organizationId ?? null
          }
          if (!orgId) return { data: sessionData }
          return {
            data: { ...sessionData, activeOrganizationId: orgId }
          }
        }
      },
      delete: {
        before: async (sessionData) => {
          const orgId = (
            sessionData as { activeOrganizationId?: string | null }
          ).activeOrganizationId
          if (!orgId) return
          await db
            .update(user)
            .set({ lastActiveOrganizationId: orgId })
            .where(eq(user.id, sessionData.userId))
        }
      }
    }
  },
  plugins: [
    organization({
      allowUserToCreateOrganization: false,
      schema: {
        organization: {
          additionalFields: {
            billingCustomerId: {
              type: "string",
              required: false,
              input: false
            },
            subscriptionStatus: {
              type: "string",
              required: false,
              input: false
            },
            deletedAt: { type: "date", required: false, input: false }
          }
        }
      },
      sendInvitationEmail: async (data) => {
        const acceptUrl = `${process.env.BETTER_AUTH_URL}/invite/${data.invitation.id}`
        process.stdout.write(
          `[invitation] org=${data.organization.slug} email=${data.email} role=${data.role} url=${acceptUrl}\n`
        )
      }
    }),
    admin(),
    mcp({
      loginPage: "/login",
      resource:
        (process.env.MCP_RESOURCE_URL ?? "http://localhost:3000") + "/mcp",
      oidcConfig: {
        loginPage: "/login",
        consentPage: "/oauth/consent"
      }
    })
  ]
})

// TODO: export inferred types.
export type User = (typeof auth.$Infer.Session)["user"]
export type Session = (typeof auth.$Infer.Session)["session"]
