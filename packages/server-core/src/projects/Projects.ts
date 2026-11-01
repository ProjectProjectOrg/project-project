import type {
  ActivityActor,
  AddMemberInput,
  AssignableRole,
  Conflict,
  CreateProjectInput,
  CursorPayload,
  Member,
  NotFound,
  Project,
  ProjectDetail,
  ProjectKey,
  LastProjectPmBlocked,
  UpdateProjectInput,
  UpdateProjectSetupInput,
  Validation,
  OrgScope,
  ProjectScope,
  Forbidden
} from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

import type { MarkdownError } from "../markdown/Markdown"

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
    NotFound | Validation | MarkdownError | LastProjectPmBlocked,
    ProjectScope | ActivityActor
  >
  readonly leave: () => Effect.Effect<
    void,
    NotFound | LastProjectPmBlocked,
    ProjectScope | ActivityActor
  >
  readonly cancelPendingMember: (
    invitationId: string
  ) => Effect.Effect<ProjectDetail, NotFound | MarkdownError, ProjectScope>
}

export class Projects extends Context.Service<Projects, ProjectsShape>()(
  "@pp/server-core/projects/Projects"
) {}
