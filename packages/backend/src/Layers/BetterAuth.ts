import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as DateTime from "effect/DateTime"
import { APIError } from "better-auth/api"
import { drizzle } from "drizzle-orm/node-postgres"
import { and, eq, inArray, isNull } from "drizzle-orm"
import { auth } from "../auth"
import * as schema from "../db/schema"
import { member, oauthClient, organization, user } from "../db/schema"
import {
  NotFound,
  paginateSorted,
  type AssignableRole,
  type CursorPayload,
  type Org,
  type OrgInvitation,
  type OrgMember,
  type OrgMembers,
  type OrgRole,
  type UserInvitation
} from "@projectproject/shared"
import { collapseRole, pendingInvitations } from "../handlers/org"
import {
  BetterAuth,
  BetterAuthError,
  NoGithubToken,
  type BetterAuthShape,
  type InvitationState
} from "../Services/BetterAuth"

export const BetterAuthLive = Layer.effect(
  BetterAuth,
  Effect.sync(() => {
    const db = drizzle(process.env.DATABASE_URL!, {
      relations: schema.relations
    })

    const attempt = <A>(thunk: () => Promise<A>) =>
      Effect.tryPromise({
        try: thunk,
        catch: (cause) => new BetterAuthError({ cause })
      })

    const resolveOrgId = (orgSlug: string) =>
      Effect.gen(function* () {
        const row = yield* attempt(() =>
          db.query.organization.findFirst({
            columns: { id: true },
            where: { slug: orgSlug }
          })
        )
        if (!row) return yield* new NotFound()
        return row.id
      })

    const resolveMemberId = (organizationId: string, userId: string) =>
      Effect.gen(function* () {
        const row = yield* attempt(() =>
          db.query.member.findFirst({
            columns: { id: true },
            where: { organizationId, userId }
          })
        )
        if (!row) return yield* new NotFound()
        return row.id
      })

    const readMember = (organizationId: string, userId: string) =>
      Effect.gen(function* () {
        const rows = yield* attempt(() =>
          db
            .select({
              userId: member.userId,
              role: member.role,
              name: user.name,
              email: user.email,
              image: user.image
            })
            .from(member)
            .innerJoin(user, eq(member.userId, user.id))
            .where(
              and(
                eq(member.organizationId, organizationId),
                eq(member.userId, userId)
              )
            )
            .limit(1)
        )
        const first = rows[0]
        if (!first) return yield* new NotFound()
        return {
          userId: first.userId,
          role: collapseRole(first.role),
          name: first.name,
          email: first.email,
          image: first.image ?? null
        } satisfies OrgMember
      })

    const readMembers = (request: Request, orgSlug: string) =>
      Effect.gen(function* () {
        const full = yield* attempt(() =>
          auth.api.getFullOrganization({
            asResponse: false,
            query: { organizationSlug: orgSlug },
            headers: request.headers,
            request
          })
        )
        if (!full) return yield* new NotFound()
        const now = DateTime.toDate(yield* DateTime.now)
        return {
          members: full.members.map((row) => ({
            userId: row.userId,
            role: collapseRole(row.role),
            name: row.user.name,
            email: row.user.email,
            image: row.user.image ?? null
          })),
          invitations: pendingInvitations(
            full.invitations.filter((invitation) => invitation.expiresAt > now)
          )
        } satisfies OrgMembers
      })

    const transferRoles = (
      orgSlug: string,
      toUserId: string,
      selfUserId: string
    ) =>
      attempt(async () => {
        if (toUserId === selfUserId) return "invalid" as const

        return db.transaction(async (tx) => {
          const rows = await tx
            .select({
              organizationId: organization.id,
              userId: member.userId,
              role: member.role
            })
            .from(organization)
            .innerJoin(member, eq(member.organizationId, organization.id))
            .where(
              and(
                eq(organization.slug, orgSlug),
                isNull(organization.deletedAt),
                inArray(member.userId, [selfUserId, toUserId])
              )
            )
            .for("update")

          const organizationId = rows[0]?.organizationId
          const self = rows.find((row) => row.userId === selfUserId)
          const target = rows.find((row) => row.userId === toUserId)

          if (!organizationId || !self || !target) return "not_found" as const
          if (collapseRole(self.role) !== "owner") return "forbidden" as const
          if (collapseRole(target.role) !== "admin") return "invalid" as const

          await tx
            .update(member)
            .set({ role: "owner" })
            .where(
              and(
                eq(member.organizationId, organizationId),
                eq(member.userId, toUserId)
              )
            )
          await tx
            .update(member)
            .set({ role: "admin" })
            .where(
              and(
                eq(member.organizationId, organizationId),
                eq(member.userId, selfUserId)
              )
            )

          return "ok" as const
        })
      })

    const setRole = (
      request: Request,
      orgSlug: string,
      userId: string,
      role: string
    ) =>
      Effect.gen(function* () {
        const organizationId = yield* resolveOrgId(orgSlug)
        const memberId = yield* resolveMemberId(organizationId, userId)
        yield* attempt(() =>
          auth.api.updateMemberRole({
            body: { role, memberId, organizationId },
            headers: request.headers,
            request
          })
        )
        return yield* readMember(organizationId, userId)
      })

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
                where: { userId, providerId: "github" }
              }),
            catch: (cause) => new BetterAuthError({ cause })
          })
          if (!row?.accessToken) return yield* new NoGithubToken()
          return row.accessToken
        }),
      getPersonalGithub: (userId) =>
        Effect.gen(function* () {
          const row = yield* Effect.tryPromise({
            try: () =>
              db.query.account.findFirst({
                columns: { id: true },
                where: { userId, providerId: "github" }
              }),
            catch: (cause) => new BetterAuthError({ cause })
          })
          return {
            connected: row !== undefined
          }
        }),
      getPersonalEverhour: (userId) =>
        Effect.gen(function* () {
          const row = yield* Effect.tryPromise({
            try: () =>
              db.query.userEverhourIntegration.findFirst({
                columns: {
                  everhourUserId: true,
                  name: true,
                  email: true,
                  lastVerifiedAt: true,
                  lastCheckError: true
                },
                where: { userId }
              }),
            catch: (cause) => new BetterAuthError({ cause })
          })
          return {
            connected: row !== undefined,
            everhourUserId: row?.everhourUserId ?? null,
            name: row?.name ?? null,
            email: row?.email ?? null,
            lastVerifiedAt: row?.lastVerifiedAt ?? null,
            lastCheckError: row?.lastCheckError ?? null
          }
        }),
      listOrganizations: (userId) =>
        Effect.gen(function* () {
          const rows = yield* Effect.tryPromise({
            try: () =>
              db
                .select({ slug: organization.slug, role: member.role })
                .from(member)
                .innerJoin(
                  organization,
                  eq(member.organizationId, organization.id)
                )
                .where(eq(member.userId, userId)),
            catch: (cause) => new BetterAuthError({ cause })
          })
          // `member.role` is a free-form text column in Better Auth's schema;
          // we coerce to the three-tier literal and drop anything unexpected.
          const allowed = new Set(["owner", "admin", "member"] as const)
          return rows.flatMap((r) =>
            allowed.has(r.role as "owner" | "admin" | "member")
              ? [
                  {
                    orgSlug: r.slug,
                    role: r.role as "owner" | "admin" | "member"
                  }
                ]
              : []
          )
        }),
      listOrganizationsPaged: (
        userId: string,
        cursor: CursorPayload | undefined,
        limit: number
      ) =>
        Effect.gen(function* () {
          const rows = yield* Effect.tryPromise({
            try: () =>
              db
                .select({
                  slug: organization.slug,
                  name: organization.name,
                  role: member.role
                })
                .from(member)
                .innerJoin(
                  organization,
                  eq(member.organizationId, organization.id)
                )
                .where(eq(member.userId, userId)),
            catch: (cause) => new BetterAuthError({ cause })
          })
          const allowed = new Set(["owner", "admin", "member"] as const)
          const orgs: ReadonlyArray<Org> = rows.flatMap((r) =>
            allowed.has(r.role as OrgRole)
              ? [
                  {
                    slug: r.slug as Org["slug"],
                    name: r.name,
                    role: r.role as OrgRole
                  }
                ]
              : []
          )
          const sorted = [...orgs].toSorted(
            (a, b) =>
              a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug)
          )
          return paginateSorted(sorted, {
            cursor,
            limit,
            sortKey: (o) => o.name,
            id: (o) => o.slug
          })
        }),
      getOrganization: (userId: string, orgSlug: string) =>
        Effect.gen(function* () {
          const row = yield* Effect.tryPromise({
            try: () =>
              db
                .select({
                  slug: organization.slug,
                  name: organization.name,
                  role: member.role
                })
                .from(member)
                .innerJoin(
                  organization,
                  eq(member.organizationId, organization.id)
                )
                .where(
                  and(eq(member.userId, userId), eq(organization.slug, orgSlug))
                )
                .limit(1),
            catch: (cause) => new BetterAuthError({ cause })
          })
          const first = row[0]
          if (!first) return yield* new NotFound()
          const allowed = new Set(["owner", "admin", "member"] as const)
          if (!allowed.has(first.role as OrgRole)) return yield* new NotFound()
          return {
            slug: first.slug as Org["slug"],
            name: first.name,
            role: first.role as OrgRole
          }
        }),
      getOrgSlugById: (organizationId) =>
        Effect.gen(function* () {
          if (!organizationId) return null
          const row = yield* Effect.tryPromise({
            try: () =>
              db.query.organization.findFirst({
                columns: { slug: true },
                where: { id: organizationId }
              }),
            catch: (cause) => new BetterAuthError({ cause })
          })
          return row?.slug ?? null
        }),
      submitConsent: (request, input) =>
        Effect.tryPromise({
          try: () =>
            auth.api
              .oauth2Consent({
                asResponse: false,
                body: input,
                headers: request.headers,
                request
              })
              .then((result) => ({ redirectURI: result.url })),
          catch: (cause) => new BetterAuthError({ cause })
        }),
      getMembers: (request, orgSlug) => readMembers(request, orgSlug),
      renameOrg: (request, orgSlug, name) =>
        Effect.gen(function* () {
          const organizationId = yield* resolveOrgId(orgSlug)
          yield* attempt(() =>
            auth.api.updateOrganization({
              body: { data: { name }, organizationId },
              headers: request.headers,
              request
            })
          )
        }),
      inviteMember: (request, orgSlug, input) =>
        Effect.gen(function* () {
          const organizationId = yield* resolveOrgId(orgSlug)
          const created = yield* attempt(() =>
            auth.api.createInvitation({
              body: {
                email: input.email,
                role: input.role,
                organizationId
              },
              headers: request.headers,
              request
            })
          )
          return {
            id: created.id,
            email: created.email,
            role: collapseRole(created.role ?? ""),
            status: "pending"
          } satisfies OrgInvitation
        }),
      updateMemberRole: (request, orgSlug, userId, role: AssignableRole) =>
        setRole(request, orgSlug, userId, role),
      removeMember: (request, orgSlug, userId) =>
        Effect.gen(function* () {
          const organizationId = yield* resolveOrgId(orgSlug)
          const memberId = yield* resolveMemberId(organizationId, userId)
          yield* attempt(() =>
            auth.api.removeMember({
              body: { memberIdOrEmail: memberId, organizationId },
              headers: request.headers,
              request
            })
          )
        }),
      cancelInvitation: (request, orgSlug, invitationId) =>
        Effect.gen(function* () {
          const organizationId = yield* resolveOrgId(orgSlug)
          const row = yield* attempt(() =>
            db.query.invitation.findFirst({
              columns: { organizationId: true },
              where: { id: invitationId }
            })
          )
          if (!row || row.organizationId !== organizationId) {
            return yield* new NotFound()
          }
          yield* attempt(() =>
            auth.api.cancelInvitation({
              body: { invitationId },
              headers: request.headers,
              request
            })
          )
        }),
      transferOwnership: (request, orgSlug, toUserId, selfUserId) =>
        Effect.gen(function* () {
          const session = yield* attempt(() =>
            auth.api.getSession({
              asResponse: false,
              headers: request.headers,
              request
            })
          )
          if (!session || session.user.id !== selfUserId) {
            return yield* new BetterAuthError({
              cause: new APIError("FORBIDDEN", {
                code: "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER",
                message: "The transfer caller does not match the session"
              })
            })
          }
          const authorization = yield* attempt(() =>
            auth.api.getFullOrganization({
              asResponse: false,
              query: { organizationSlug: orgSlug },
              headers: request.headers,
              request
            })
          )
          if (!authorization) return yield* new NotFound()

          const state = yield* transferRoles(orgSlug, toUserId, selfUserId)
          if (state === "not_found") return yield* new NotFound()
          if (state === "forbidden") {
            return yield* new BetterAuthError({
              cause: new APIError("FORBIDDEN", {
                code: "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER",
                message: "Only an organization owner can transfer ownership"
              })
            })
          }
          if (state === "invalid") {
            return yield* new BetterAuthError({
              cause: new APIError("BAD_REQUEST", {
                code: "ROLE_NOT_FOUND",
                message:
                  "Ownership can only be transferred to an organization admin"
              })
            })
          }
          return yield* readMembers(request, orgSlug)
        }),
      leaveOrg: (request, orgSlug) =>
        Effect.gen(function* () {
          const organizationId = yield* resolveOrgId(orgSlug)
          yield* attempt(() =>
            auth.api.leaveOrganization({
              body: { organizationId },
              headers: request.headers,
              request
            })
          )
        }),
      listInvitations: (request) =>
        Effect.gen(function* () {
          const invitations = yield* attempt(() =>
            auth.api.listUserInvitations({
              asResponse: false,
              headers: request.headers,
              request
            })
          )
          const now = DateTime.toDate(yield* DateTime.now)
          const actionable = invitations.filter(
            (invitation) => invitation.expiresAt > now
          )
          if (actionable.length === 0) return []
          const orgIds = [...new Set(actionable.map((i) => i.organizationId))]
          const inviterIds = [...new Set(actionable.map((i) => i.inviterId))]
          const orgs = yield* attempt(() =>
            db
              .select({
                id: organization.id,
                slug: organization.slug,
                name: organization.name
              })
              .from(organization)
              .where(inArray(organization.id, orgIds))
          )
          const inviters = yield* attempt(() =>
            db
              .select({ id: user.id, email: user.email })
              .from(user)
              .where(inArray(user.id, inviterIds))
          )
          const orgById = new Map(orgs.map((o) => [o.id, o]))
          const inviterById = new Map(inviters.map((u) => [u.id, u.email]))
          return actionable.flatMap((i) => {
            const org = orgById.get(i.organizationId)
            if (!org) return []
            return [
              {
                id: i.id,
                orgSlug: org.slug as Org["slug"],
                orgName: org.name,
                role: collapseRole(i.role ?? ""),
                inviterEmail: inviterById.get(i.inviterId) ?? null,
                expiresAt: i.expiresAt,
                createdAt: i.createdAt
              } satisfies UserInvitation
            ]
          })
        }),
      getInvitation: (request, invitationId) =>
        Effect.gen(function* () {
          const found = yield* attempt(() =>
            auth.api.getInvitation({
              query: { id: invitationId },
              headers: request.headers,
              request
            })
          )
          return {
            id: found.id,
            orgSlug: found.organizationSlug as Org["slug"],
            orgName: found.organizationName,
            role: collapseRole(found.role ?? ""),
            inviterEmail: found.inviterEmail ?? null,
            expiresAt: found.expiresAt,
            createdAt: found.createdAt
          } satisfies UserInvitation
        }),
      getInvitationState: (invitationId) =>
        Effect.gen(function* () {
          const row = yield* attempt(() =>
            db.query.invitation.findFirst({
              columns: { status: true, email: true, expiresAt: true },
              where: { id: invitationId }
            })
          )
          if (!row) return null
          return {
            status: row.status,
            email: row.email,
            expiresAt: row.expiresAt
          } satisfies InvitationState
        }),
      acceptInvitation: (request, invitationId) =>
        Effect.gen(function* () {
          const accepted = yield* attempt(() =>
            auth.api.acceptInvitation({
              body: { invitationId },
              headers: request.headers,
              request
            })
          )
          const acceptedMember = accepted?.member
          if (!acceptedMember) return yield* new NotFound()
          const rows = yield* attempt(() =>
            db
              .select({ slug: organization.slug, name: organization.name })
              .from(organization)
              .where(eq(organization.id, acceptedMember.organizationId))
              .limit(1)
          )
          const org = rows[0]
          if (!org) return yield* new NotFound()
          return {
            slug: org.slug as Org["slug"],
            name: org.name,
            role: collapseRole(acceptedMember.role ?? "")
          } satisfies Org
        }),
      rejectInvitation: (request, invitationId) =>
        attempt(() =>
          auth.api.rejectInvitation({
            body: { invitationId },
            headers: request.headers,
            request
          })
        ).pipe(Effect.asVoid),
      getPublicClientName: (clientId) =>
        Effect.gen(function* () {
          const rows = yield* attempt(() =>
            db
              .select({ name: oauthClient.name })
              .from(oauthClient)
              .where(eq(oauthClient.clientId, clientId))
              .limit(1)
          )
          return rows[0]?.name ?? null
        })
    } satisfies BetterAuthShape
  })
)
