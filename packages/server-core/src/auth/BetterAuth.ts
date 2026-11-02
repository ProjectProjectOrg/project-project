import type {
  OrgAssignableRole,
  OrgRole,
  CursorPayload,
  InviteMemberInput,
  NotFound,
  Org,
  OrgInvitation,
  OrgMember,
  OrgMembers,
  PersonalEverhour,
  PersonalGithub,
  User,
  UserIdentity,
  UserInvitation
} from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

export class BetterAuthError extends Schema.TaggedError<BetterAuthError>()(
  "BetterAuthError",
  { cause: Schema.Unknown }
) {}

export class NoGithubToken extends Schema.TaggedError<NoGithubToken>()(
  "NoGithubToken",
  {}
) {}

export const InvitationState = Schema.Struct({
  status: Schema.String,
  email: Schema.String,
  expiresAt: Schema.Date
})
export type InvitationState = typeof InvitationState.Type

export type AuthUser = Readonly<{
  id: string
  email: string
  name: string
  image?: string | null
  createdAt: Date
  username?: string | null
  editorPreference?: string | null
}>

export type AuthSession = Readonly<{
  activeOrganizationId?: string | null
}>

export class BetterAuth extends Context.Service<
  BetterAuth,
  Readonly<{
    handler: (request: Request) => Effect.Effect<Response, BetterAuthError>
    getSession: (
      headers: Headers
    ) => Effect.Effect<
      { user: AuthUser; session: AuthSession } | null,
      BetterAuthError
    >
    getGithubAccessToken: (
      userId: string
    ) => Effect.Effect<string, NoGithubToken | BetterAuthError>
    getPersonalGithub: (
      userId: string
    ) => Effect.Effect<PersonalGithub, BetterAuthError>
    getPersonalEverhour: (
      userId: string
    ) => Effect.Effect<PersonalEverhour, BetterAuthError>
    getOrgSlugById: (
      organizationId: string | null | undefined
    ) => Effect.Effect<string | null, BetterAuthError>
    me: (
      identity: UserIdentity,
      activeOrganizationId: string | null | undefined
    ) => Effect.Effect<User, BetterAuthError>
    listOrganizations: (
      userId: string
    ) => Effect.Effect<
      ReadonlyArray<{ orgSlug: string; role: OrgRole }>,
      BetterAuthError
    >
    listOrganizationsPaged: (
      userId: string,
      cursor: CursorPayload | undefined,
      limit: number
    ) => Effect.Effect<
      { items: ReadonlyArray<Org>; nextCursor: string | null },
      BetterAuthError
    >
    getOrganization: (
      userId: string,
      orgSlug: string
    ) => Effect.Effect<Org, BetterAuthError | NotFound>
    submitConsent: (
      request: Request,
      input: { accept: boolean; oauth_query: string }
    ) => Effect.Effect<{ redirectURI: string }, BetterAuthError>
    getMembers: (
      request: Request,
      orgSlug: string
    ) => Effect.Effect<OrgMembers, BetterAuthError | NotFound>
    renameOrg: (
      request: Request,
      orgSlug: string,
      name: string
    ) => Effect.Effect<void, BetterAuthError | NotFound>
    inviteMember: (
      request: Request,
      orgSlug: string,
      input: InviteMemberInput
    ) => Effect.Effect<OrgInvitation, BetterAuthError | NotFound>
    updateMemberRole: (
      request: Request,
      orgSlug: string,
      userId: string,
      role: OrgAssignableRole
    ) => Effect.Effect<OrgMember, BetterAuthError | NotFound>
    removeMember: (
      request: Request,
      orgSlug: string,
      userId: string
    ) => Effect.Effect<void, BetterAuthError | NotFound>
    cancelInvitation: (
      request: Request,
      orgSlug: string,
      invitationId: string
    ) => Effect.Effect<void, BetterAuthError | NotFound>
    transferOwnership: (
      request: Request,
      orgSlug: string,
      toUserId: string,
      selfUserId: string
    ) => Effect.Effect<OrgMembers, BetterAuthError | NotFound>
    setActiveOrganization: (
      request: Request,
      orgSlug: string
    ) => Effect.Effect<ReadonlyArray<string>, BetterAuthError | NotFound>
    leaveOrg: (
      request: Request,
      orgSlug: string,
      userId: string
    ) => Effect.Effect<void, BetterAuthError | NotFound>
    listInvitations: (
      request: Request
    ) => Effect.Effect<ReadonlyArray<UserInvitation>, BetterAuthError>
    getInvitation: (
      request: Request,
      invitationId: string
    ) => Effect.Effect<UserInvitation, BetterAuthError | NotFound>
    getInvitationState: (
      invitationId: string
    ) => Effect.Effect<InvitationState | null, BetterAuthError>
    acceptInvitation: (
      request: Request,
      invitationId: string
    ) => Effect.Effect<Org, BetterAuthError | NotFound>
    rejectInvitation: (
      request: Request,
      invitationId: string
    ) => Effect.Effect<void, BetterAuthError | NotFound>
    getPublicClientName: (
      clientId: string
    ) => Effect.Effect<string | null, BetterAuthError>
  }>
>()("@pp/server-core/auth/BetterAuth") {}
