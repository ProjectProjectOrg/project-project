import * as schema from "@pp/db/schema"
import { member, oauthClient, organization, user } from "@pp/db/schema"
import * as BetterAuth from "@pp/server-core/auth/BetterAuth"
import {
  AvatarOption,
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
  type OrgAssignableRole,
  type User,
  type UserIdentity,
  type CursorPayload,
  type InviteMemberInput
} from "@pp/shared"
import { APIError } from "better-auth/api"
import { and, eq, inArray, isNull } from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

import { orgRoleOf, pendingInvitations } from "../organizations/Handlers"
import {
  acceptAsExistingMember,
  assertNotLastProjectPm,
  auth,
  keepingAProjectPm
} from "./config"

const decodeOrgMember = Schema.decodeEffect(OrgMember)

const decodeOrgMembers = Schema.decodeEffect(OrgMembers)

const decodePersonalGithub = Schema.decodeEffect(PersonalGithub)

const decodePersonalEverhour = Schema.decodeEffect(PersonalEverhour)

const decodeAvatarOptions = Schema.decodeEffect(Schema.Array(AvatarOption))

const GoogleIdTokenClaims = Schema.fromJsonString(
  Schema.Struct({ picture: Schema.optional(Schema.String) })
)

const decodeGoogleIdTokenClaims =
  Schema.decodeUnknownOption(GoogleIdTokenClaims)

const googlePicture = (idToken: string | null) => {
  const payload = idToken?.split(".")[1]
  if (!payload) return null
  return decodeGoogleIdTokenClaims(
    Buffer.from(payload, "base64url").toString("utf8")
  ).pipe(
    Option.flatMapNullishOr((claims) => claims.picture),
    Option.getOrNull
  )
}

const providerAvatar = (
  account: Readonly<{
    providerId: string
    accountId: string
    idToken: string | null
  }>
) => {
  switch (account.providerId) {
    case "github":
      return {
        source: "github" as const,
        image: `https://avatars.githubusercontent.com/u/${account.accountId}?v=4`
      }
    case "google": {
      const image = googlePicture(account.idToken)
      return image ? { source: "google" as const, image } : null
    }
    default:
      return null
  }
}

const decodeOrgMembership = Schema.decodeEffect(
  Schema.Struct({
    orgSlug: Schema.String,
    role: OrgRole
  })
)

const decodeOrg = Schema.decodeEffect(Org)

const decodeOrgInvitation = Schema.decodeEffect(OrgInvitation)

const decodeUserInvitation = Schema.decodeEffect(UserInvitation)

const decodeInvitationState = Schema.decodeEffect(BetterAuth.InvitationState)

const TransferOutcome = Schema.Union([
  Schema.TaggedStruct("ok", {}),
  Schema.TaggedStruct("not_found", {}),
  Schema.TaggedStruct("forbidden", {}),
  Schema.TaggedStruct("invalid", {})
])

const decodeTransferOutcome = Schema.decodeEffect(TransferOutcome)

export const BetterAuthLive = Layer.effect(
  BetterAuth.BetterAuth,
  Effect.sync(() => {
    const db = drizzle(process.env.DATABASE_URL!, {
      relations: schema.relations
    })

    const attempt = <A>(thunk: () => Promise<A>) =>
      Effect.tryPromise({
        try: thunk,
        catch: (cause) => new BetterAuth.BetterAuthError({ cause })
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
      return yield* decodeOrgMember({
        userId: first.userId,
        role: orgRoleOf(first.role),
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
      return yield* decodeOrgMembers({
        members: full.members.map((row) => ({
          userId: row.userId,
          role: orgRoleOf(row.role),
          name: row.user.name,
          email: row.user.email,
          image: row.user.image ?? null
        })),
        invitations: pendingInvitations(
          full.invitations.filter((invitation) => invitation.expiresAt > now)
        )
      }).pipe(Effect.orDie)
    })

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
                if (orgRoleOf(self.role) !== "owner") {
                  return { _tag: "forbidden" as const }
                }
                if (orgRoleOf(target.role) !== "admin") {
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
      const outcome = yield* decodeTransferOutcome(raw).pipe(Effect.orDie)
      return yield* Match.value(outcome).pipe(
        Match.tagsExhaustive({
          ok: () => Effect.void,
          not_found: () => new NotFound(),
          forbidden: () =>
            new BetterAuth.BetterAuthError({
              cause: new APIError("FORBIDDEN", {
                code: "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER",
                message: "Only an organization owner can transfer ownership"
              })
            }),
          invalid: () =>
            new BetterAuth.BetterAuthError({
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
          asResponse: false,
          body: { role, memberId, organizationId },
          headers: request.headers,
          request
        })
      )
      return yield* readMember(organizationId, userId)
    })

    const getPersonalGithub = Effect.fn("BetterAuth.getPersonalGithub")(
      function* (userId: string) {
        const row = yield* attempt(() =>
          db.query.account.findFirst({
            columns: { id: true },
            where: { userId, providerId: "github" }
          })
        )
        return yield* decodePersonalGithub({
          connected: row !== undefined
        }).pipe(Effect.orDie)
      }
    )

    const getPersonalEverhour = Effect.fn("BetterAuth.getPersonalEverhour")(
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
        return yield* decodePersonalEverhour({
          connected: row !== undefined,
          everhourUserId: row?.everhourUserId ?? null,
          name: row?.name ?? null,
          email: row?.email ?? null,
          lastVerifiedAt: row?.lastVerifiedAt?.toISOString() ?? null,
          lastCheckError: row?.lastCheckError ?? null
        }).pipe(Effect.orDie)
      }
    )

    const getLinkedAccounts = Effect.fn("BetterAuth.getLinkedAccounts")(
      function* (userId: string) {
        const accounts = yield* attempt(() =>
          db.query.account.findMany({
            columns: { providerId: true, accountId: true, idToken: true },
            where: { userId }
          })
        )
        const providerOptions = accounts.flatMap(
          (account) => providerAvatar(account) ?? []
        )
        const avatarOptions = yield* decodeAvatarOptions([
          { source: "generated", image: null },
          ...providerOptions.filter(
            (option, index) =>
              providerOptions.findIndex((o) => o.source === option.source) ===
              index
          )
        ]).pipe(Effect.orDie)
        const personalGithub = yield* decodePersonalGithub({
          connected: accounts.some((account) => account.providerId === "github")
        }).pipe(Effect.orDie)
        return { avatarOptions, personalGithub }
      }
    )

    const getOrgSlugById = Effect.fn("BetterAuth.getOrgSlugById")(function* (
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
    })

    const me = Effect.fn("BetterAuth.me")(function* (
      identity: UserIdentity,
      activeOrganizationId: string | null | undefined
    ) {
      const [
        activeOrgSlug,
        { personalGithub, avatarOptions },
        personalEverhour
      ] = yield* Effect.all(
        [
          getOrgSlugById(activeOrganizationId),
          getLinkedAccounts(identity.id),
          getPersonalEverhour(identity.id)
        ],
        { concurrency: "unbounded" }
      )
      return {
        ...identity,
        activeOrgSlug,
        personalGithub,
        personalEverhour,
        avatarOptions
      } satisfies User
    })

    return BetterAuth.BetterAuth.of({
      handler: Effect.fn("BetterAuth.handler")(function* (request: Request) {
        return yield* Effect.tryPromise({
          try: () => auth.handler(request),
          catch: (cause) => new BetterAuth.BetterAuthError({ cause })
        })
      }),
      getPersonalGithub,
      getPersonalEverhour,
      getOrgSlugById,
      me,
      getSession: Effect.fn("BetterAuth.getSession")(function* (
        headers: Headers
      ) {
        return yield* Effect.tryPromise({
          try: () => auth.api.getSession({ headers }),
          catch: (cause) => new BetterAuth.BetterAuthError({ cause })
        })
      }),
      getGithubAccessToken: Effect.fn("BetterAuth.getGithubAccessToken")(
        function* (userId: string) {
          const row = yield* attempt(() =>
            db.query.account.findFirst({
              columns: { accessToken: true },
              where: { userId, providerId: "github" }
            })
          )
          if (!row?.accessToken) return yield* new BetterAuth.NoGithubToken()
          return row.accessToken
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
            .where(
              and(eq(member.userId, userId), isNull(organization.deletedAt))
            )
        )
        return yield* Effect.forEach(rows, (row) =>
          decodeOrgMembership({
            orgSlug: row.slug,
            role: orgRoleOf(row.role)
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
              .where(
                and(eq(member.userId, userId), isNull(organization.deletedAt))
              )
          )
          const orgs = yield* Effect.forEach(rows, (row) =>
            decodeOrg({
              slug: row.slug,
              name: row.name,
              role: orgRoleOf(row.role)
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
              and(
                eq(member.userId, userId),
                eq(organization.slug, orgSlug),
                isNull(organization.deletedAt)
              )
            )
            .limit(1)
        )
        const first = row[0]
        if (!first) return yield* new NotFound()
        return yield* decodeOrg({
          slug: first.slug,
          name: first.name,
          role: orgRoleOf(first.role)
        }).pipe(Effect.orDie)
      }),
      submitConsent: Effect.fn("BetterAuth.submitConsent")(function* (
        request: Request,
        input: { accept: boolean; oauth_query: string }
      ) {
        return yield* Effect.tryPromise({
          try: () =>
            auth.api
              .oauth2Consent({
                asResponse: false,
                body: input,
                headers: request.headers,
                request
              })
              .then((result) => ({ redirectURI: result.url })),
          catch: (cause) => new BetterAuth.BetterAuthError({ cause })
        })
      }),
      getMembers: Effect.fn("BetterAuth.getMembers")(function* (
        request: Request,
        orgSlug: string
      ) {
        return yield* readMembers(request, orgSlug)
      }),
      renameOrg: Effect.fn("BetterAuth.renameOrg")(function* (
        request: Request,
        orgSlug: string,
        name: string
      ) {
        const organizationId = yield* resolveOrgId(orgSlug)
        yield* attempt(() =>
          auth.api.updateOrganization({
            asResponse: false,
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
            asResponse: false,
            body: {
              email: input.email,
              role: input.role,
              organizationId
            },
            headers: request.headers,
            request
          })
        )
        return yield* decodeOrgInvitation({
          id: created.id,
          email: created.email,
          role: orgRoleOf(created.role),
          status: "pending"
        }).pipe(Effect.orDie)
      }),
      updateMemberRole: Effect.fn("BetterAuth.updateMemberRole")(function* (
        request: Request,
        orgSlug: string,
        userId: string,
        role: OrgAssignableRole
      ) {
        return yield* setRole(request, orgSlug, userId, role)
      }),
      removeMember: Effect.fn("BetterAuth.removeMember")(function* (
        request: Request,
        orgSlug: string,
        userId: string
      ) {
        const organizationId = yield* resolveOrgId(orgSlug)
        const memberId = yield* resolveMemberId(organizationId, userId)
        yield* attempt(() =>
          keepingAProjectPm(organizationId, userId, () =>
            auth.api.removeMember({
              asResponse: false,
              body: { memberIdOrEmail: memberId, organizationId },
              headers: request.headers,
              request
            })
          )
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
            asResponse: false,
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
          return yield* new BetterAuth.BetterAuthError({
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
      setActiveOrganization: Effect.fn("BetterAuth.setActiveOrganization")(
        function* (request: Request, orgSlug: string) {
          const organizationId = yield* resolveOrgId(orgSlug)
          const { headers } = yield* attempt(() =>
            auth.api.setActiveOrganization({
              body: { organizationId },
              headers: request.headers,
              returnHeaders: true
            })
          )
          return headers.getSetCookie()
        }
      ),
      leaveOrg: Effect.fn("BetterAuth.leaveOrg")(function* (
        request: Request,
        orgSlug: string,
        userId: string
      ) {
        const organizationId = yield* resolveOrgId(orgSlug)
        yield* attempt(() => assertNotLastProjectPm(organizationId, userId))
        yield* attempt(() =>
          keepingAProjectPm(organizationId, userId, () =>
            auth.api.leaveOrganization({
              asResponse: false,
              body: { organizationId },
              headers: request.headers,
              request
            })
          )
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
                role: orgRoleOf(invitation.role),
                inviterEmail: inviterById.get(invitation.inviterId) ?? null,
                expiresAt: invitation.expiresAt.toISOString(),
                createdAt: invitation.createdAt.toISOString()
              }
            ]
          }),
          (row) => decodeUserInvitation(row).pipe(Effect.orDie)
        )
      }),
      getInvitation: Effect.fn("BetterAuth.getInvitation")(function* (
        request: Request,
        invitationId: string
      ) {
        const found = yield* attempt(() =>
          auth.api.getInvitation({
            asResponse: false,
            query: { id: invitationId },
            headers: request.headers,
            request
          })
        )
        return yield* decodeUserInvitation({
          id: found.id,
          orgSlug: found.organizationSlug,
          orgName: found.organizationName,
          role: orgRoleOf(found.role),
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
        return yield* decodeInvitationState({
          status: row.status,
          email: row.email,
          expiresAt: row.expiresAt
        }).pipe(Effect.orDie)
      }),
      acceptInvitation: Effect.fn("BetterAuth.acceptInvitation")(function* (
        request: Request,
        invitationId: string
      ) {
        const session = yield* attempt(() =>
          auth.api.getSession({ headers: request.headers })
        )
        if (!session) return yield* new NotFound()
        const alreadyMember = yield* attempt(() =>
          acceptAsExistingMember(invitationId, session.user)
        )
        const acceptedMember =
          alreadyMember ??
          (yield* attempt(() =>
            auth.api.acceptInvitation({
              asResponse: false,
              body: { invitationId },
              headers: request.headers,
              request
            })
          ))?.member
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
        return yield* decodeOrg({
          slug: org.slug,
          name: org.name,
          role: orgRoleOf(acceptedMember.role)
        }).pipe(Effect.orDie)
      }),
      rejectInvitation: Effect.fn("BetterAuth.rejectInvitation")(function* (
        request: Request,
        invitationId: string
      ) {
        yield* attempt(() =>
          auth.api.rejectInvitation({
            asResponse: false,
            body: { invitationId },
            headers: request.headers,
            request
          })
        )
      }),
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
    })
  })
)
