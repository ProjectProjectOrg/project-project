import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import type {
  AddMemberInput,
  AssignableRole,
  ConnectGithubInput,
  Conflict,
  CreateProjectInput,
  CursorPayload,
  Forbidden,
  GitHubError,
  GitHubScopeInsufficient,
  GitHubTokenExpired,
  Member,
  NotFound,
  Project,
  ProjectDetail,
  ProjectKey,
  RepoGone,
  Role,
  UpdateProjectInput
} from "@projectproject/shared"
import type { MarkdownError } from "./Markdown"

export interface ProjectMembership {
  readonly role: Role
}

export interface ProjectsShape {
  readonly list: (
    orgSlug: string,
    userId: string
  ) => Effect.Effect<ReadonlyArray<Project>>
  readonly listPaged: (
    orgSlug: string,
    userId: string,
    cursor: CursorPayload | undefined,
    limit: number
  ) => Effect.Effect<{
    items: ReadonlyArray<Project>
    nextCursor: string | null
  }>
  readonly listMembersPaged: (
    orgSlug: string,
    userId: string,
    slug: string,
    cursor: CursorPayload | undefined,
    limit: number
  ) => Effect.Effect<
    { items: ReadonlyArray<Member>; nextCursor: string | null },
    NotFound
  >
  readonly create: (
    orgSlug: string,
    createdBy: string,
    input: CreateProjectInput
  ) => Effect.Effect<Project, NotFound | Conflict>
  readonly get: (
    orgSlug: string,
    userId: string,
    slug: string
  ) => Effect.Effect<ProjectDetail, NotFound | MarkdownError>
  readonly getKey: (
    orgSlug: string,
    userId: string,
    slug: string
  ) => Effect.Effect<ProjectKey, NotFound>
  readonly update: (
    orgSlug: string,
    userId: string,
    slug: string,
    input: UpdateProjectInput
  ) => Effect.Effect<ProjectDetail, NotFound | Forbidden | MarkdownError>
  readonly remove: (
    orgSlug: string,
    userId: string,
    slug: string
  ) => Effect.Effect<void, NotFound | Forbidden | MarkdownError>
  readonly requireMember: (
    orgSlug: string,
    userId: string,
    slug: string
  ) => Effect.Effect<ProjectMembership, NotFound>
  readonly requireRole: (
    orgSlug: string,
    userId: string,
    slug: string,
    allowed: ReadonlyArray<Role>
  ) => Effect.Effect<ProjectMembership, NotFound | Forbidden>
  readonly addMember: (
    orgSlug: string,
    userId: string,
    slug: string,
    input: AddMemberInput
  ) => Effect.Effect<ProjectDetail, NotFound | Forbidden | MarkdownError>
  readonly updateMember: (
    orgSlug: string,
    userId: string,
    slug: string,
    targetUserId: string,
    nextRole: AssignableRole
  ) => Effect.Effect<ProjectDetail, NotFound | Forbidden | MarkdownError>
  readonly removeMember: (
    orgSlug: string,
    userId: string,
    slug: string,
    targetUserId: string
  ) => Effect.Effect<ProjectDetail, NotFound | Forbidden | MarkdownError>
  readonly cancelPendingMember: (
    orgSlug: string,
    userId: string,
    slug: string,
    invitationId: string
  ) => Effect.Effect<ProjectDetail, NotFound | Forbidden | MarkdownError>
  readonly connectGithub: (
    orgSlug: string,
    userId: string,
    slug: string,
    input: ConnectGithubInput
  ) => Effect.Effect<
    ProjectDetail,
    | NotFound
    | Forbidden
    | GitHubTokenExpired
    | GitHubScopeInsufficient
    | RepoGone
    | GitHubError
    | MarkdownError
  >
  readonly disconnectGithub: (
    orgSlug: string,
    userId: string,
    slug: string
  ) => Effect.Effect<ProjectDetail, NotFound | Forbidden | MarkdownError>
}

export class Projects extends Context.Tag(
  "@projectproject/backend/Services/Projects"
)<Projects, ProjectsShape>() {}
