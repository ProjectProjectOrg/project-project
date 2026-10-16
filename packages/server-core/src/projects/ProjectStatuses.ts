import type {
  Conflict,
  CreateStatusInput,
  DeleteStatusInput,
  NotFound,
  ProjectStatus,
  ReorderStatusInput,
  UpdateStatusInput,
  Forbidden
} from "@pp/shared"
import type { ProjectScope } from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

import type { MarkdownError } from "../markdown/Markdown"

export interface ProjectStatusesShape {
  readonly list: () => Effect.Effect<
    ReadonlyArray<ProjectStatus>,
    never,
    ProjectScope
  >

  readonly create: (
    input: CreateStatusInput
  ) => Effect.Effect<ProjectStatus, Conflict, ProjectScope>

  readonly update: (
    statusSlug: string,
    input: UpdateStatusInput
  ) => Effect.Effect<
    ProjectStatus,
    Forbidden | NotFound | Conflict | MarkdownError,
    ProjectScope
  >

  readonly reorder: (
    statusSlug: string,
    input: ReorderStatusInput
  ) => Effect.Effect<ProjectStatus, NotFound, ProjectScope>

  readonly remove: (
    statusSlug: string,
    input: DeleteStatusInput
  ) => Effect.Effect<
    void,
    Forbidden | NotFound | Conflict | MarkdownError,
    ProjectScope
  >
}

export class ProjectStatuses extends Context.Service<
  ProjectStatuses,
  ProjectStatusesShape
>()("@pp/server-core/projects/ProjectStatuses") {}
