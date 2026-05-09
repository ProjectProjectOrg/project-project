import { Context, type Effect } from "effect"
import type {
  AddMemberInput,
  AssignableRole,
  ConnectGithubInput,
  CreateProjectInput,
  Forbidden,
  GitHubError,
  GitHubScopeInsufficient,
  GitHubTokenExpired,
  NotFound,
  Project,
  ProjectDetail,
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
  readonly create: (
    orgSlug: string,
    createdBy: string,
    input: CreateProjectInput
  ) => Effect.Effect<Project, NotFound>
  readonly get: (
    orgSlug: string,
    userId: string,
    slug: string
  ) => Effect.Effect<ProjectDetail, NotFound | MarkdownError>
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

export class Projects extends Context.Tag("Projects")<
  Projects,
  ProjectsShape
>() {}
