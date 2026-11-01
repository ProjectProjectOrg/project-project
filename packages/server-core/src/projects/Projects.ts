import type {
  Conflict,
  CreateProjectInput,
  CursorPayload,
  NotFound,
  Project,
  ProjectDetail,
  ProjectKey,
  UpdateProjectInput,
  UpdateProjectSetupInput,
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
  readonly key: () => Effect.Effect<ProjectKey, NotFound, ProjectScope>

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
}

export class Projects extends Context.Service<Projects, ProjectsShape>()(
  "@pp/server-core/projects/Projects"
) {}
