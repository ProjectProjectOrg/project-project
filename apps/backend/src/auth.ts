import { cimd } from "@better-auth/cimd"
import { mcp } from "@better-auth/mcp"
import * as BunServices from "@effect/platform-bun/BunServices"
import * as authSchema from "@pp/db/auth-schema"
import { publishedProject } from "@pp/db/projectVisibility"
import * as schema from "@pp/db/schema"
import {
  projectIndex,
  projectInviteGrant,
  projectMember,
  user
} from "@pp/db/schema"
import { TicketFrontmatter } from "@pp/server-core/tickets/TicketDocs"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { APIError } from "better-auth/api"
import { admin, jwt, magicLink, organization } from "better-auth/plugins"
import { and, eq, isNull, ne } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import { alias } from "drizzle-orm/pg-core"
import { FileSystem, Path, Schema, Struct } from "effect"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import matter from "gray-matter"

import { fetchClientMetadataResource } from "./auth/cimdTransport"
import { legacyMcpResources } from "./auth/legacyMcpResources"
import {
  orgAccessControl,
  orgRoles,
  requireSingleOrgRole
} from "./auth/orgAccess"

const db = drizzle(process.env.DATABASE_URL!, { relations: schema.relations })

const SAFE_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
const TICKET_FILE = /^T-[1-9][0-9]*\.md$/
const decodeTicketFrontmatter = Schema.decodeUnknownOption(TicketFrontmatter)
const encodeTicketFrontmatter = Schema.encodeSync(TicketFrontmatter)

function roleList(role: string): ReadonlyArray<string> {
  return role.split(",").map((r) => r.trim())
}

export function lastOrgOwnerBlocked(input: {
  nextRole: string | null
  targetRole: string | null
  otherOwnerCount: number
}): boolean {
  if (input.nextRole !== null && roleList(input.nextRole).includes("owner")) {
    return false
  }
  if (
    input.targetRole === null ||
    !roleList(input.targetRole).includes("owner")
  ) {
    return false
  }
  return input.otherOwnerCount === 0
}

export function lastProjectPmError(
  projectSlugs: ReadonlyArray<string>
): APIError | undefined {
  if (projectSlugs.length === 0) return undefined
  return new APIError(409, {
    code: "LAST_PROJECT_PM_BLOCKED",
    message:
      "Make someone else PM of these projects before removing this member",
    projectSlugs: [...projectSlugs]
  })
}

async function assertNotLastOrgOwner(
  organizationId: string,
  targetUserId: string,
  nextRole: string | null
) {
  if (nextRole !== null && roleList(nextRole).includes("owner")) return
  const target = await db.query.member.findFirst({
    columns: { role: true },
    where: { organizationId, userId: targetUserId }
  })
  if (!target || !roleList(target.role).includes("owner")) return
  const others = await db.query.member.findMany({
    columns: { id: true },
    where: {
      organizationId,
      role: "owner",
      userId: { ne: targetUserId }
    }
  })
  if (
    lastOrgOwnerBlocked({
      nextRole,
      targetRole: target.role,
      otherOwnerCount: others.length
    })
  ) {
    throw new APIError("BAD_REQUEST", {
      code: "LAST_ORG_OWNER_BLOCKED",
      message: "Cannot remove or demote the last organization owner"
    })
  }
}

async function lastPmProjectSlugs(organizationId: string, userId: string) {
  const otherPm = alias(projectMember, "other_pm")
  return db
    .select({ slug: projectIndex.slug })
    .from(projectIndex)
    .innerJoin(
      projectMember,
      and(
        eq(projectMember.projectId, projectIndex.id),
        eq(projectMember.userId, userId),
        eq(projectMember.roleId, "pm")
      )
    )
    .leftJoin(
      otherPm,
      and(
        eq(otherPm.projectId, projectIndex.id),
        eq(otherPm.roleId, "pm"),
        ne(otherPm.userId, userId)
      )
    )
    .where(
      and(
        eq(projectIndex.organizationId, organizationId),
        isNull(otherPm.userId),
        publishedProject()
      )
    )
}

function projectsRoot() {
  const root = process.env.PROJECTS_DIR
  if (!root) {
    throw new APIError("INTERNAL_SERVER_ERROR", {
      code: "PROJECTS_DIR_MISSING",
      message: "PROJECTS_DIR is not configured"
    })
  }
  return root
}

async function unassignUserFromActiveTicketsOnDisk(
  orgSlug: string,
  projectSlug: string,
  userId: string
) {
  if (!SAFE_SLUG.test(orgSlug) || !SAFE_SLUG.test(projectSlug)) return
  await Effect.runPromise(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const root = projectsRoot()
      const absoluteRoot = path.isAbsolute(root)
        ? root
        : path.resolve(process.cwd(), root)
      const ticketsDir = path.join(
        absoluteRoot,
        "orgs",
        orgSlug,
        "projects",
        projectSlug,
        "tickets"
      )
      const exists = yield* fs.exists(ticketsDir)
      if (!exists) return
      const files = yield* fs.readDirectory(ticketsDir)
      yield* Effect.forEach(
        files.filter((file) => TICKET_FILE.test(file)),
        (file) =>
          Effect.gen(function* () {
            const filePath = path.join(ticketsDir, file)
            const raw = yield* fs.readFileString(filePath, "utf8")
            const parsed = matter(raw)
            const decoded = decodeTicketFrontmatter(parsed.data)
            if (Option.isNone(decoded)) return
            const frontmatter = decoded.value
            if (
              frontmatter.status === "done" ||
              !frontmatter.assignees.includes(userId)
            ) {
              return
            }
            const updated = Struct.evolve(frontmatter, {
              assignees: (assignees) => assignees.filter((id) => id !== userId),
              updatedAt: () => DateTime.toDate(DateTime.nowUnsafe())
            })
            yield* fs.writeFileString(
              filePath,
              matter.stringify(
                parsed.content,
                Object.assign(
                  Struct.omit(parsed.data, ["assignee"]),
                  encodeTicketFrontmatter(updated)
                )
              )
            )
          }),
        { concurrency: 8 }
      )
    }).pipe(Effect.provide(BunServices.layer))
  )
}

export async function assertNotLastProjectPm(
  organizationId: string,
  userId: string
) {
  const lastPm = await lastPmProjectSlugs(organizationId, userId)
  const blocked = lastProjectPmError(lastPm.map((project) => project.slug))
  if (blocked) throw blocked
}

const constraintOf = (error: unknown): string | undefined => {
  if (typeof error !== "object" || error === null) return undefined
  if ("constraint" in error && typeof error.constraint === "string") {
    return error.constraint
  }
  return "cause" in error ? constraintOf(error.cause) : undefined
}

export const violatesProjectKeepsAPm = (error: unknown) =>
  constraintOf(error) === "project_keeps_a_pm"

export async function keepingAProjectPm<A>(
  organizationId: string,
  userId: string,
  run: () => Promise<A>
) {
  try {
    return await run()
  } catch (error) {
    if (violatesProjectKeepsAPm(error)) {
      await assertNotLastProjectPm(organizationId, userId)
    }
    throw error
  }
}

export async function unassignRemovedOrgMember(
  orgSlug: string,
  organizationId: string,
  userId: string
) {
  const projects = await db
    .select({ slug: projectIndex.slug })
    .from(projectIndex)
    .where(
      and(eq(projectIndex.organizationId, organizationId), publishedProject())
    )
  await Promise.all(
    projects.map((project) =>
      unassignUserFromActiveTicketsOnDisk(orgSlug, project.slug, userId)
    )
  )
}

export const mcpResource = new URL(
  "/mcp",
  process.env.MCP_RESOURCE_URL ??
    process.env.BETTER_AUTH_URL ??
    "http://localhost:3000"
).href

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: authSchema
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: [
    "http://localhost:5173",
    "http://localhost:3000",
    ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : [])
  ],
  // `username` is a human-readable handle used in markdown frontmatter and
  // the members UI. Better Auth's CLI doesn't know about it from the schema
  // alone — declaring it here lets `auth.api.updateUser` etc. round-trip
  // the field.
  user: {
    additionalFields: {
      username: {
        type: "string",
        required: false,
        input: false,
        unique: true
      },
      editorPreference: {
        type: "string",
        required: false,
        input: true
      }
    }
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["github", "google"],
      allowDifferentEmails: true
    }
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      scope: ["repo", "read:org"],
      disableSignUp: true
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET
    }
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60
    }
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
            where: { id: sessionData.userId }
          })
          let orgId = currentUser?.lastActiveOrganizationId ?? null
          if (orgId) {
            const stillMember = await db.query.member.findFirst({
              columns: { organizationId: true },
              where: { userId: sessionData.userId, organizationId: orgId }
            })
            if (!stillMember) orgId = null
          }
          if (!orgId) {
            const firstMembership = await db.query.member.findFirst({
              columns: { organizationId: true },
              where: { userId: sessionData.userId }
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
      ac: orgAccessControl,
      roles: orgRoles,
      disableOrganizationDeletion: true,
      requireEmailVerificationOnInvitation: true,
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
      },
      organizationHooks: {
        beforeUpdateOrganization: async ({ organization }) => {
          if (
            Object.entries(organization).some(
              ([field, value]) => field !== "name" && value !== undefined
            )
          ) {
            throw new APIError("BAD_REQUEST", {
              code: "ORGANIZATION_FIELD_LOCKED",
              message: "Only the organization name can be changed"
            })
          }
        },
        beforeCreateInvitation: async ({ invitation }) => {
          requireSingleOrgRole(invitation.role)
        },
        beforeAddMember: async ({ member }) => {
          requireSingleOrgRole(member.role)
        },
        beforeRemoveMember: async ({ member }) => {
          await assertNotLastOrgOwner(
            member.organizationId,
            member.userId,
            null
          )
          await assertNotLastProjectPm(member.organizationId, member.userId)
        },
        afterRemoveMember: async ({ member, organization }) => {
          await unassignRemovedOrgMember(
            organization.slug,
            member.organizationId,
            member.userId
          )
        },
        beforeUpdateMemberRole: async ({ member, newRole }) => {
          requireSingleOrgRole(newRole)
          await assertNotLastOrgOwner(
            member.organizationId,
            member.userId,
            newRole
          )
        },
        afterAcceptInvitation: async ({ invitation, user }) => {
          await db.transaction(async (tx) => {
            const grants = await tx
              .select({
                projectId: projectInviteGrant.projectId,
                roleId: projectInviteGrant.roleId
              })
              .from(projectInviteGrant)
              .innerJoin(
                projectIndex,
                and(
                  eq(projectIndex.id, projectInviteGrant.projectId),
                  eq(projectIndex.organizationId, invitation.organizationId),
                  publishedProject()
                )
              )
              .where(eq(projectInviteGrant.invitationId, invitation.id))

            if (grants.length > 0) {
              await tx
                .insert(projectMember)
                .values(
                  grants.map((grant) => ({
                    projectId: grant.projectId,
                    organizationId: invitation.organizationId,
                    userId: user.id,
                    roleId: grant.roleId
                  }))
                )
                .onConflictDoNothing({
                  target: [projectMember.projectId, projectMember.userId]
                })
            }

            await tx
              .delete(projectInviteGrant)
              .where(eq(projectInviteGrant.invitationId, invitation.id))
          })
        },
        afterRejectInvitation: async ({ invitation }) => {
          await db
            .delete(projectInviteGrant)
            .where(eq(projectInviteGrant.invitationId, invitation.id))
        },
        afterCancelInvitation: async ({ invitation }) => {
          await db
            .delete(projectInviteGrant)
            .where(eq(projectInviteGrant.invitationId, invitation.id))
        }
      }
    }),
    magicLink({
      sendMagicLink: async (data) => {
        process.stdout.write(
          `[magic-link] email=${data.email} url=${data.url}\n`
        )
      }
    }),
    admin(),
    jwt(),
    mcp({
      loginPage: "/login",
      resource: mcpResource,
      consentPage: "/oauth/consent",
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      // Refresh tokens rotate on every use. Without an overlap window, a
      // second presentation of an already-rotated token is treated as a
      // breach and `invalidateRefreshFamily` deletes *every* refresh token
      // for that client/user pair — forcing a full browser re-auth. MCP
      // clients run as several long-lived processes sharing one credential,
      // so concurrent refreshes across the access-token expiry are routine.
      refreshTokenReuseInterval: 60,
      extensions: [
        {
          claims: {
            accessToken: async ({ user, client }) => ({
              pp_consent_ids: user
                ? (
                    await db
                      .select({ id: authSchema.oauthConsent.id })
                      .from(authSchema.oauthConsent)
                      .where(
                        and(
                          eq(authSchema.oauthConsent.userId, user.id),
                          eq(authSchema.oauthConsent.clientId, client.clientId)
                        )
                      )
                  ).map((consent) => consent.id)
                : []
            })
          }
        }
      ]
    }),
    cimd({
      fetchClientMetadataResource,
      metadataProfile: "mcp-2026-07-28"
    }),
    legacyMcpResources({ db, resource: mcpResource })
  ]
})

export type User = (typeof auth.$Infer.Session)["user"]
export type Session = (typeof auth.$Infer.Session)["session"]
