import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as DateTime from "effect/DateTime"
import * as Match from "effect/Match"
import * as Schema from "effect/Schema"
import { APIError } from "better-auth/api"
import { drizzle } from "drizzle-orm/node-postgres"
import { and, eq, inArray, isNull } from "drizzle-orm"
import { auth } from "../auth"
import * as schema from "../db/schema"
import { member, oauthClient, organization, user } from "../db/schema"
import {
  NotFound,
  Org,
  OrgInvitation,
  OrgMember,
  OrgMembers,
  OrgRole,
  paginateSorted,
  PersonalEverhour,
  PersonalGithub,
  UserInvitation,
  type AssignableRole,
  type CursorPayload,
  type InviteMemberInput
} from "@projectproject/shared"
import { collapseRole, pendingInvitations } from "../handlers/org"
import {
  BetterAuth,
  BetterAuthError,
  InvitationState,
  NoGithubToken,
  type BetterAuthShape
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

    const resolveOrgId = Effect.fn("BetterAuth.resolveOrgId")(function* (
      orgSlug: string
    ) {
      const row = yield* attempt(() =>
        db.query.organization.findFirst({
          columns: { id: true },
          where: { slug: orgSlug }
        })
      )
      if (!row) return yield* new NotFound()
      return row.id
    })

    const resolveMemberId = Effect.fn("BetterAuth.resolveMemberId")(function* (
      organizationId: string,
      userId: string
    ) {
      const row = yield* attempt(() =>
        db.query.member.findFirst({
          columns: { id: true },
          where: { organizationId, userId }
        })
      )
      if (!row) return yield* new NotFound()
      return row.id
    })

    const readMember = Effect.fn("BetterAuth.readMember")(function* (
      organizationId: string,
      userId: string
    ) {
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
      return yield* Schema.decodeEffect(OrgMember)({
        userId: first.userId,
        role: collapseRole(first.role),
        name: first.name,
        email: first.email,
        image: first.image ?? null
      }).pipe(Effect.orDie)
    })

    const readMembers = Effect.fn("BetterAuth.readMembers")(function* (
      request: Request,
      orgSlug: string
    ) {
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
      return yield* Schema.decodeEffect(OrgMembers)({
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
      }).pipe(Effect.orDie)
    })

    const TransferOutcome = Schema.Union([
      Schema.TaggedStruct("ok", {}),
      Schema.TaggedStruct("not_found", {}),
      Schema.TaggedStruct("forbidden", {}),
      Schema.TaggedStruct("invalid", {})
    ])

    const transferRoles = Effect.fn("BetterAuth.transferRoles")(function* (
      orgSlug: string,
      toUserId: string,
      selfUserId: string
    ) {
      const raw =
        toUserId === selfUserId
          ? { _tag: "invalid" as const }
          : yield* attempt(() =>
              db.transaction(async (tx) => {
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

                if (!organizationId || !self || !target) {
                  return { _tag: "not_found" as const }
                }
                if (collapseRole(self.role) !== "owner") {
                  return { _tag: "forbidden" as const }
                }
                if (collapseRole(target.role) !== "admin") {
                  return { _tag: "invalid" as const }
                }

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

                return { _tag: "ok" as const }
              })
            )
      const outcome = yield* Schema.decodeEffect(TransferOutcome)(raw).pipe(
        Effect.orDie
      )
      return yield* Match.value(outcome).pipe(
        Match.tagsExhaustive({
          ok: () => Effect.void,
          not_found: () => new NotFound(),
          forbidden: () =>
            new BetterAuthError({
              cause: new APIError("FORBIDDEN", {
                code: "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER",
                message: "Only an organization owner can transfer ownership"
              })
            }),
          invalid: () =>
            new BetterAuthError({
              cause: new APIError("BAD_REQUEST", {
                code: "ROLE_NOT_FOUND",
                message:
                  "Ownership can only be transferred to an organization admin"
              })
            })
        })
      )
    })

    const setRole = Effect.fn("BetterAuth.setRole")(function* (
      request: Request,
      orgSlug: string,
      userId: string,
      role: string
    ) {
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
      getGithubAccessToken: Effect.fn("BetterAuth.getGithubAccessToken")(
        function* (userId: string) {
          const row = yield* attempt(() =>
            db.query.account.findFirst({
              columns: { accessToken: true },
              where: { userId, providerId: "github" }
            })
          )
          if (!row?.accessToken) return yield* new NoGithubToken()
          return row.accessToken
        }
      ),
      getPersonalGithub: Effect.fn("BetterAuth.getPersonalGithub")(function* (
        userId: string
      ) {
        const row = yield* attempt(() =>
          db.query.account.findFirst({
            columns: { id: true },
            where: { userId, providerId: "github" }
          })
        )
        return yield* Schema.decodeEffect(PersonalGithub)({
          connected: row !== undefined
        }).pipe(Effect.orDie)
      }),
      getPersonalEverhour: Effect.fn("BetterAuth.getPersonalEverhour")(
        function* (userId: string) {
          const row = yield* attempt(() =>
            db.query.userEverhourIntegration.findFirst({
              columns: {
                everhourUserId: true,
                name: true,
                email: true,
                lastVerifiedAt: true,
                lastCheckError: true
              },
              where: { userId }
            })
          )
          return yield* Schema.decodeEffect(PersonalEverhour)({
            connected: row !== undefined,
            everhourUserId: row?.everhourUserId ?? null,
            name: row?.name ?? null,
            email: row?.email ?? null,
            lastVerifiedAt: row?.lastVerifiedAt?.toISOString() ?? null,
            lastCheckError: row?.lastCheckError ?? null
          }).pipe(Effect.orDie)
        }
      ),
      listOrganizations: Effect.fn("BetterAuth.listOrganizations")(function* (
        userId: string
      ) {
        const rows = yield* attempt(() =>
          db
            .select({ slug: organization.slug, role: member.role })
            .from(member)
            .innerJoin(organization, eq(member.organizationId, organization.id))
            .where(eq(member.userId, userId))
        )
        return yield* Effect.forEach(rows, (row) =>
          Schema.decodeEffect(
            Schema.Struct({
              orgSlug: Schema.String,
              role: OrgRole
            })
          )({
            orgSlug: row.slug,
            role: collapseRole(row.role)
          }).pipe(Effect.orDie)
        )
      }),
      listOrganizationsPaged: Effect.fn("BetterAuth.listOrganizationsPaged")(
        function* (
          userId: string,
          cursor: CursorPayload | undefined,
          limit: number
        ) {
          const rows = yield* attempt(() =>
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
              .where(eq(member.userId, userId))
          )
          const orgs = yield* Effect.forEach(rows, (row) =>
            Schema.decodeEffect(Org)({
              slug: row.slug,
              name: row.name,
              role: collapseRole(row.role)
            }).pipe(Effect.orDie)
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
        }
      ),
      getOrganization: Effect.fn("BetterAuth.getOrganization")(function* (
        userId: string,
        orgSlug: string
      ) {
        const row = yield* attempt(() =>
          db
            .select({
              slug: organization.slug,
              name: organization.name,
              role: member.role
            })
            .from(member)
            .innerJoin(organization, eq(member.organizationId, organization.id))
            .where(
              and(eq(member.userId, userId), eq(organization.slug, orgSlug))
            )
            .limit(1)
        )
        const first = row[0]
        if (!first) return yield* new NotFound()
        return yield* Schema.decodeEffect(Org)({
          slug: first.slug,
          name: first.name,
          role: collapseRole(first.role)
        }).pipe(Effect.orDie)
      }),
      getOrgSlugById: Effect.fn("BetterAuth.getOrgSlugById")(function* (
        organizationId: string | null | undefined
      ) {
        if (!organizationId) return null
        const row = yield* attempt(() =>
          db.query.organization.findFirst({
            columns: { slug: true },
            where: { id: organizationId }
          })
        )
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
      renameOrg: Effect.fn("BetterAuth.renameOrg")(function* (
        request: Request,
        orgSlug: string,
        name: string
      ) {
        const organizationId = yield* resolveOrgId(orgSlug)
        yield* attempt(() =>
          auth.api.updateOrganization({
            body: { data: { name }, organizationId },
            headers: request.headers,
            request
          })
        )
      }),
      inviteMember: Effect.fn("BetterAuth.inviteMember")(function* (
        request: Request,
        orgSlug: string,
        input: InviteMemberInput
      ) {
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
        return yield* Schema.decodeEffect(OrgInvitation)({
          id: created.id,
          email: created.email,
          role: collapseRole(created.role ?? ""),
          status: "pending"
        }).pipe(Effect.orDie)
      }),
      updateMemberRole: (request, orgSlug, userId, role: AssignableRole) =>
        setRole(request, orgSlug, userId, role),
      removeMember: Effect.fn("BetterAuth.removeMember")(function* (
        request: Request,
        orgSlug: string,
        userId: string
      ) {
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
      cancelInvitation: Effect.fn("BetterAuth.cancelInvitation")(function* (
        request: Request,
        orgSlug: string,
        invitationId: string
      ) {
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
      transferOwnership: Effect.fn("BetterAuth.transferOwnership")(function* (
        request: Request,
        orgSlug: string,
        toUserId: string,
        selfUserId: string
      ) {
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

        yield* transferRoles(orgSlug, toUserId, selfUserId)
        return yield* readMembers(request, orgSlug)
      }),
      leaveOrg: Effect.fn("BetterAuth.leaveOrg")(function* (
        request: Request,
        orgSlug: string
      ) {
        const organizationId = yield* resolveOrgId(orgSlug)
        yield* attempt(() =>
          auth.api.leaveOrganization({
            body: { organizationId },
            headers: request.headers,
            request
          })
        )
      }),
      listInvitations: Effect.fn("BetterAuth.listInvitations")(function* (
        request: Request
      ) {
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
        return yield* Effect.forEach(
          actionable.flatMap((invitation) => {
            const org = orgById.get(invitation.organizationId)
            if (!org) return []
            return [
              {
                id: invitation.id,
                orgSlug: org.slug,
                orgName: org.name,
                role: collapseRole(invitation.role ?? ""),
                inviterEmail: inviterById.get(invitation.inviterId) ?? null,
                expiresAt: invitation.expiresAt.toISOString(),
                createdAt: invitation.createdAt.toISOString()
              }
            ]
          }),
          (row) => Schema.decodeEffect(UserInvitation)(row).pipe(Effect.orDie)
        )
      }),
      getInvitation: Effect.fn("BetterAuth.getInvitation")(function* (
        request: Request,
        invitationId: string
      ) {
        const found = yield* attempt(() =>
          auth.api.getInvitation({
            query: { id: invitationId },
            headers: request.headers,
            request
          })
        )
        return yield* Schema.decodeEffect(UserInvitation)({
          id: found.id,
          orgSlug: found.organizationSlug,
          orgName: found.organizationName,
          role: collapseRole(found.role ?? ""),
          inviterEmail: found.inviterEmail ?? null,
          expiresAt: found.expiresAt.toISOString(),
          createdAt: found.createdAt.toISOString()
        }).pipe(Effect.orDie)
      }),
      getInvitationState: Effect.fn("BetterAuth.getInvitationState")(function* (
        invitationId: string
      ) {
        const row = yield* attempt(() =>
          db.query.invitation.findFirst({
            columns: { status: true, email: true, expiresAt: true },
            where: { id: invitationId }
          })
        )
        if (!row) return null
        return yield* Schema.decodeEffect(InvitationState)({
          status: row.status,
          email: row.email,
          expiresAt: row.expiresAt
        }).pipe(Effect.orDie)
      }),
      acceptInvitation: Effect.fn("BetterAuth.acceptInvitation")(function* (
        request: Request,
        invitationId: string
      ) {
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
        return yield* Schema.decodeEffect(Org)({
          slug: org.slug,
          name: org.name,
          role: collapseRole(acceptedMember.role ?? "")
        }).pipe(Effect.orDie)
      }),
      rejectInvitation: (request, invitationId) =>
        attempt(() =>
          auth.api.rejectInvitation({
            body: { invitationId },
            headers: request.headers,
            request
          })
        ).pipe(Effect.asVoid),
      getPublicClientName: Effect.fn("BetterAuth.getPublicClientName")(
        function* (clientId: string) {
          const rows = yield* attempt(() =>
            db
              .select({ name: oauthClient.name })
              .from(oauthClient)
              .where(eq(oauthClient.clientId, clientId))
              .limit(1)
          )
          return rows[0]?.name ?? null
        }
      )
    } satisfies BetterAuthShape
  })
)
