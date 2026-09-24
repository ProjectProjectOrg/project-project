import type {
  OrgAssignableRole,
  CursorPayload,
  InviteMemberInput,
  NotFound,
  Org,
  OrgInvitation,
  OrgMember,
  OrgMembers,
  PersonalEverhour,
  PersonalGithub,
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

export type BetterAuthShape = Readonly<{
  readonly handler: (
    request: Request
  ) => Effect.Effect<Response, BetterAuthError>
  readonly getSession: (
    headers: Headers
  ) => Effect.Effect<
    { user: AuthUser; session: AuthSession } | null,
    BetterAuthError
  >
  readonly getGithubAccessToken: (
    userId: string
  ) => Effect.Effect<string, NoGithubToken | BetterAuthError>
  readonly getPersonalGithub: (
    userId: string
  ) => Effect.Effect<PersonalGithub, BetterAuthError>
  readonly getPersonalEverhour: (
    userId: string
  ) => Effect.Effect<PersonalEverhour, BetterAuthError>
  readonly getOrgSlugById: (
    organizationId: string | null | undefined
  ) => Effect.Effect<string | null, BetterAuthError>
  // Org membership list for a user. Returns the org slug + the user's role
  // in that org. Used by the MCP `me` tool to populate `roles`. We hit the
  // `member` + `organization` tables directly rather than going through
  // `auth.api.listOrganizations` because that API is headers-based — here we
  // already have the resolved userId from `CurrentUser`.
  readonly listOrganizations: (
    userId: string
  ) => Effect.Effect<
    ReadonlyArray<{ orgSlug: string; role: "owner" | "admin" | "member" }>,
    BetterAuthError
  >
  readonly listOrganizationsPaged: (
    userId: string,
    cursor: CursorPayload | undefined,
    limit: number
  ) => Effect.Effect<
    { items: ReadonlyArray<Org>; nextCursor: string | null },
    BetterAuthError
  >
  readonly getOrganization: (
    userId: string,
    orgSlug: string
  ) => Effect.Effect<Org, BetterAuthError | NotFound>
  readonly submitConsent: (
    request: Request,
    input: { accept: boolean; oauth_query: string }
  ) => Effect.Effect<{ redirectURI: string }, BetterAuthError>
  readonly getMembers: (
    request: Request,
    orgSlug: string
  ) => Effect.Effect<OrgMembers, BetterAuthError | NotFound>
  readonly renameOrg: (
    request: Request,
    orgSlug: string,
    name: string
  ) => Effect.Effect<void, BetterAuthError | NotFound>
  readonly inviteMember: (
    request: Request,
    orgSlug: string,
    input: InviteMemberInput
  ) => Effect.Effect<OrgInvitation, BetterAuthError | NotFound>
  readonly updateMemberRole: (
    request: Request,
    orgSlug: string,
    userId: string,
    role: OrgAssignableRole
  ) => Effect.Effect<OrgMember, BetterAuthError | NotFound>
  readonly removeMember: (
    request: Request,
    orgSlug: string,
    userId: string
  ) => Effect.Effect<void, BetterAuthError | NotFound>
  readonly cancelInvitation: (
    request: Request,
    orgSlug: string,
    invitationId: string
  ) => Effect.Effect<void, BetterAuthError | NotFound>
  readonly transferOwnership: (
    request: Request,
    orgSlug: string,
    toUserId: string,
    selfUserId: string
  ) => Effect.Effect<OrgMembers, BetterAuthError | NotFound>
  readonly leaveOrg: (
    request: Request,
    orgSlug: string,
    userId: string
  ) => Effect.Effect<void, BetterAuthError | NotFound>
  readonly listInvitations: (
    request: Request
  ) => Effect.Effect<ReadonlyArray<UserInvitation>, BetterAuthError>
  readonly getInvitation: (
    request: Request,
    invitationId: string
  ) => Effect.Effect<UserInvitation, BetterAuthError | NotFound>
  readonly getInvitationState: (
    invitationId: string
  ) => Effect.Effect<InvitationState | null, BetterAuthError>
  readonly acceptInvitation: (
    request: Request,
    invitationId: string
  ) => Effect.Effect<Org, BetterAuthError | NotFound>
  readonly rejectInvitation: (
    request: Request,
    invitationId: string
  ) => Effect.Effect<void, BetterAuthError | NotFound>
  readonly getPublicClientName: (
    clientId: string
  ) => Effect.Effect<string | null, BetterAuthError>
}>

export class BetterAuth extends Context.Service<BetterAuth, BetterAuthShape>()(
  "@pp/server-core/auth/BetterAuth"
) {}
