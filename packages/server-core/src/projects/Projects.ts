import type {
  AddMemberInput,
  BranchListResponse,
  GithubRepoPage,
  AssignableRole,
  ConnectGithubInput,
  Conflict,
  CreateProjectInput,
  CursorPayload,
  GitHubError,
  GitHubScopeInsufficient,
  GitHubTokenExpired,
  Member,
  NotFound,
  Project,
  ProjectDetail,
  ProjectKey,
  LastProjectPmBlocked,
  RateLimited,
  RepoGone,
  UpdateProjectInput,
  UpdateProjectSetupInput,
  OrgScope,
  ProjectScope,
  Forbidden
} from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

import type { MarkdownError } from "../markdown/Markdown"
import type { MalformedTicketDocument } from "../tickets/TicketDocs"

export interface ProjectGithubIntegration {
  readonly projectIntegrationLinkId: string
  readonly organizationId: string
  readonly projectId: string
  readonly projectSlug: string
  readonly installationId: string
  readonly repoId: string
  readonly repoOwner: string
  readonly repoName: string
  readonly defaultBaseBranch: string
}

export interface ProjectsShape {
  readonly list: () => Effect.Effect<ReadonlyArray<Project>, never, OrgScope>
  readonly listPaged: (
    cursor: CursorPayload | undefined,
    limit: number
  ) => Effect.Effect<
    { items: ReadonlyArray<Project>; nextCursor: string | null },
    never,
    OrgScope
  >
  readonly create: (
    input: CreateProjectInput
  ) => Effect.Effect<Project, Conflict, OrgScope>
  readonly get: () => Effect.Effect<
    ProjectDetail,
    NotFound | MarkdownError,
    ProjectScope
  >
  readonly listMembersPaged: (
    cursor: CursorPayload | undefined,
    limit: number
  ) => Effect.Effect<
    { items: ReadonlyArray<Member>; nextCursor: string | null },
    never,
    ProjectScope
  >
  readonly key: () => Effect.Effect<ProjectKey, NotFound, ProjectScope>
  readonly githubIntegration: () => Effect.Effect<
    ProjectGithubIntegration | null,
    never,
    ProjectScope
  >
  readonly githubBranches: (
    query: string | undefined,
    first: number
  ) => Effect.Effect<
    BranchListResponse,
    RepoGone | RateLimited | GitHubError,
    ProjectScope
  >
  readonly githubRepos: (
    query: string | undefined,
    page: number
  ) => Effect.Effect<
    GithubRepoPage,
    NotFound | RepoGone | RateLimited | GitHubError,
    ProjectScope
  >
  readonly memberIds: () => Effect.Effect<
    ReadonlySet<string>,
    never,
    ProjectScope
  >
  readonly update: (
    input: UpdateProjectInput
  ) => Effect.Effect<
    ProjectDetail,
    Forbidden | NotFound | MarkdownError,
    ProjectScope
  >
  readonly updateSetup: (
    input: UpdateProjectSetupInput
  ) => Effect.Effect<ProjectDetail, NotFound | MarkdownError, ProjectScope>
  readonly remove: () => Effect.Effect<void, MarkdownError, ProjectScope>
  readonly addMember: (
    input: AddMemberInput
  ) => Effect.Effect<
    ProjectDetail,
    NotFound | Forbidden | MarkdownError | LastProjectPmBlocked,
    ProjectScope
  >
  readonly updateMember: (
    targetUserId: string,
    nextRole: AssignableRole
  ) => Effect.Effect<
    ProjectDetail,
    NotFound | MarkdownError | LastProjectPmBlocked,
    ProjectScope
  >
  readonly removeMember: (
    targetUserId: string
  ) => Effect.Effect<
    ProjectDetail,
    NotFound | MarkdownError | MalformedTicketDocument | LastProjectPmBlocked,
    ProjectScope
  >
  readonly cancelPendingMember: (
    invitationId: string
  ) => Effect.Effect<ProjectDetail, NotFound | MarkdownError, ProjectScope>
  readonly unassignUserFromActiveTickets: (
    orgSlug: string,
    slug: string,
    userId: string
  ) => Effect.Effect<void, MarkdownError | MalformedTicketDocument>
  readonly connectGithub: (
    input: ConnectGithubInput
  ) => Effect.Effect<
    ProjectDetail,
    | NotFound
    | Conflict
    | GitHubTokenExpired
    | GitHubScopeInsufficient
    | RepoGone
    | RateLimited
    | GitHubError
    | MarkdownError,
    ProjectScope
  >
  readonly disconnectGithub: () => Effect.Effect<
    ProjectDetail,
    NotFound | MarkdownError,
    ProjectScope
  >
}

export class Projects extends Context.Service<Projects, ProjectsShape>()(
  "@pp/server-core/projects/Projects"
) {}
