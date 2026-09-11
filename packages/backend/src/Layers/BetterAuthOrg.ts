import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import {
  NotFound,
  type AssignableRole,
  type InviteMemberInput,
  type Org,
  type OrgDetail,
  type OrgInvitation,
  type OrgMember,
  type OrgMembers,
  type UserInvitation
} from "@projectproject/shared"
import { auth } from "../auth"
import { BetterAuthError } from "../Services/BetterAuth"
import { collapseRole } from "../handlers/orgMembers"

const makeAssignableRole = Schema.decodeUnknownSync(
  Schema.Literals(["admin", "member"])
)

const mapMember = (member: {
  userId: string
  role: string
  user?: { name?: string | null; email?: string | null; image?: string | null } | null
}): OrgMember => ({
  userId: member.userId,
  role: collapseRole(member.role),
  name: member.user?.name ?? member.user?.email ?? "",
  email: member.user?.email ?? "",
  image: member.user?.image ?? null
})

const mapInvitation = (invitation: {
  id: string
  email: string
  role: string
}): OrgInvitation => ({
  id: invitation.id,
  email: invitation.email,
  role: collapseRole(invitation.role)
})

const orgIdForSlug = (request: Request, orgSlug: string) =>
  Effect.tryPromise({
    try: () =>
      auth.api.getFullOrganization({
        query: { organizationSlug: orgSlug },
        headers: request.headers,
        request
      }),
    catch: (cause) => new BetterAuthError({ cause })
  }).pipe(
    Effect.flatMap((full) =>
      full?.id ? Effect.succeed(full.id) : Effect.fail(new NotFound())
    )
  )

export const betterAuthOrgMethods = {
  getMembers: (request: Request, orgSlug: string) =>
    Effect.tryPromise({
        try: () =>
          auth.api.getFullOrganization({
            query: { organizationSlug: orgSlug },
            headers: request.headers,
            request
          }),
        catch: (cause) => new BetterAuthError({ cause })
      }).pipe(
        Effect.flatMap((full) => {
          if (!full) return Effect.fail(new NotFound())
          const members = (full.members ?? []).map(mapMember)
          const invitations = (full.invitations ?? [])
            .filter((invitation) => invitation.status === "pending")
            .map(mapInvitation)
          return Effect.succeed({ members, invitations } satisfies OrgMembers)
        })
      ),

  renameOrg: (request: Request, orgSlug: string, name: string) =>
    Effect.gen(function* () {
        const orgId = yield* orgIdForSlug(request, orgSlug)
        yield* Effect.tryPromise({
          try: () =>
            auth.api.updateOrganization({
              body: { data: { name }, organizationId: orgId },
              headers: request.headers,
              request
            }),
          catch: (cause) => new BetterAuthError({ cause })
        })
        const full = yield* Effect.tryPromise({
          try: () =>
            auth.api.getFullOrganization({
              query: { organizationSlug: orgSlug },
              headers: request.headers,
              request
            }),
          catch: (cause) => new BetterAuthError({ cause })
        })
        if (!full) return yield* new NotFound()
        const self = full.members?.[0]
        return {
          id: full.id,
          slug: full.slug,
          name: full.name,
          role: collapseRole(self?.role ?? "member"),
          createdAt: full.createdAt,
          deletedAt: full.deletedAt ?? null,
          purgeAt: null
        } satisfies OrgDetail
      }),

  inviteMember: (request: Request, orgSlug: string, input: InviteMemberInput) =>
    Effect.gen(function* () {
        const orgId = yield* orgIdForSlug(request, orgSlug)
        const invitation = yield* Effect.tryPromise({
          try: () =>
            auth.api.createInvitation({
              body: {
                email: input.email,
                role: input.role,
                organizationId: orgId
              },
              headers: request.headers,
              request
            }),
          catch: (cause) => new BetterAuthError({ cause })
        })
        return mapInvitation(invitation)
      }),

  updateMemberRole: (
    request: Request,
    orgSlug: string,
    userId: string,
    role: AssignableRole
  ) =>
    Effect.gen(function* () {
        const orgId = yield* orgIdForSlug(request, orgSlug)
        const full = yield* Effect.tryPromise({
          try: () =>
            auth.api.getFullOrganization({
              query: { organizationSlug: orgSlug },
              headers: request.headers,
              request
            }),
          catch: (cause) => new BetterAuthError({ cause })
        })
        const member = full?.members?.find((m) => m.userId === userId)
        if (!member) return yield* new NotFound()
        yield* Effect.tryPromise({
          try: () =>
            auth.api.updateMemberRole({
              body: {
                role: makeAssignableRole(role),
                memberId: member.id,
                organizationId: orgId
              },
              headers: request.headers,
              request
            }),
          catch: (cause) => new BetterAuthError({ cause })
        })
        return mapMember({ ...member, role })
      }),

  removeMember: (request: Request, orgSlug: string, userId: string) =>
    Effect.gen(function* () {
        const orgId = yield* orgIdForSlug(request, orgSlug)
        const full = yield* Effect.tryPromise({
          try: () =>
            auth.api.getFullOrganization({
              query: { organizationSlug: orgSlug },
              headers: request.headers,
              request
            }),
          catch: (cause) => new BetterAuthError({ cause })
        })
        const member = full?.members?.find((m) => m.userId === userId)
        if (!member) return yield* new NotFound()
        yield* Effect.tryPromise({
          try: () =>
            auth.api.removeMember({
              body: { memberIdOrEmail: member.id, organizationId: orgId },
              headers: request.headers,
              request
            }),
          catch: (cause) => new BetterAuthError({ cause })
        })
      }),

  cancelInvitation: (
    request: Request,
    _orgSlug: string,
    invitationId: string
  ) =>
    Effect.tryPromise({
        try: () =>
          auth.api.cancelInvitation({
            body: { invitationId },
            headers: request.headers,
            request
          }),
        catch: (cause) => new BetterAuthError({ cause })
      }),

  transferOwnership: (
    request: Request,
    orgSlug: string,
    toUserId: string,
    selfUserId: string
  ) =>
    Effect.gen(function* () {
        const orgId = yield* orgIdForSlug(request, orgSlug)
        const full = yield* Effect.tryPromise({
          try: () =>
            auth.api.getFullOrganization({
              query: { organizationSlug: orgSlug },
              headers: request.headers,
              request
            }),
          catch: (cause) => new BetterAuthError({ cause })
        })
        const target = full?.members?.find((m) => m.userId === toUserId)
        const self = full?.members?.find((m) => m.userId === selfUserId)
        if (!target || !self) return yield* new NotFound()
        yield* Effect.tryPromise({
          try: () =>
            auth.api.updateMemberRole({
              body: { role: "owner", memberId: target.id, organizationId: orgId },
              headers: request.headers,
              request
            }),
          catch: (cause) => new BetterAuthError({ cause })
        })
        yield* Effect.tryPromise({
          try: () =>
            auth.api.updateMemberRole({
              body: { role: "admin", memberId: self.id, organizationId: orgId },
              headers: request.headers,
              request
            }),
          catch: (cause) => new BetterAuthError({ cause })
        })
        return yield* betterAuthOrgMethods.getMembers(request, orgSlug)
      }),

  leaveOrg: (request: Request, orgSlug: string) =>
    Effect.gen(function* () {
        const orgId = yield* orgIdForSlug(request, orgSlug)
        yield* Effect.tryPromise({
          try: () =>
            auth.api.leaveOrganization({
              body: { organizationId: orgId },
              headers: request.headers,
              request
            }),
          catch: (cause) => new BetterAuthError({ cause })
        })
      }),

  listInvitations: (request: Request) =>
    Effect.gen(function* () {
        const listed = yield* Effect.tryPromise({
          try: () =>
            auth.api.listUserInvitations({
              headers: request.headers,
              request
            }),
          catch: (cause) => new BetterAuthError({ cause })
        })
        const out: Array<UserInvitation> = []
        for (const invite of listed ?? []) {
          const detail = yield* Effect.tryPromise({
            try: () =>
              auth.api.getInvitation({
                query: { id: invite.id },
                headers: request.headers,
                request
              }),
            catch: (cause) => new BetterAuthError({ cause })
          })
          if (!detail) continue
          out.push({
            id: detail.id,
            orgSlug: detail.organizationSlug,
            orgName: detail.organizationName,
            role: collapseRole(detail.role),
            inviterEmail: detail.inviterEmail ?? null,
            expiresAt: detail.expiresAt
          })
        }
        return out
      }),

  getInvitation: (request: Request, invitationId: string) =>
    Effect.tryPromise({
        try: () =>
          auth.api.getInvitation({
            query: { id: invitationId },
            headers: request.headers,
            request
          }),
        catch: (cause) => new BetterAuthError({ cause })
      }).pipe(
        Effect.flatMap((detail) => {
          if (!detail) return Effect.fail(new NotFound())
          return Effect.succeed({
            id: detail.id,
            orgSlug: detail.organizationSlug,
            orgName: detail.organizationName,
            role: collapseRole(detail.role),
            inviterEmail: detail.inviterEmail ?? null,
            expiresAt: detail.expiresAt
          } satisfies UserInvitation)
        })
      ),

  acceptInvitation: (request: Request, invitationId: string, _userId: string) =>
    Effect.gen(function* () {
      const invite = yield* betterAuthOrgMethods.getInvitation(
        request,
        invitationId
      )
      yield* Effect.tryPromise({
        try: () =>
          auth.api.acceptInvitation({
            body: { invitationId },
            headers: request.headers,
            request
          }),
        catch: (cause) => new BetterAuthError({ cause })
      })
      return {
        slug: invite.orgSlug,
        name: invite.orgName,
        role: invite.role
      } satisfies Org
    }),

  rejectInvitation: (request: Request, invitationId: string) =>
    Effect.tryPromise({
        try: () =>
          auth.api.rejectInvitation({
            body: { invitationId },
            headers: request.headers,
            request
          }),
        catch: (cause) => new BetterAuthError({ cause })
      }),

  getPublicClientName: (clientId: string) =>
    Effect.tryPromise({
      try: async () => {
        const response = await auth.handler(
          new Request(
            `${process.env.BETTER_AUTH_URL}/api/auth/oauth2/public-client?client_id=${encodeURIComponent(clientId)}`
          )
        )
        if (!response.ok) return null
        const data = (await response.json()) as { client_name?: string | null }
        return data.client_name?.trim() || null
      },
      catch: (cause) => new BetterAuthError({ cause })
    })
} as const
