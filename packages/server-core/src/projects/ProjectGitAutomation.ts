import type {
  Conflict,
  GitAutomation,
  ProjectScope,
  UpdateGitAutomationInput
} from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

import type { GitAutomationConfig } from "../tickets/gitAutomation"

export type ProjectGitAutomationShape = Readonly<{
  get: () => Effect.Effect<GitAutomation, never, ProjectScope>
  configFor: (projectId: string) => Effect.Effect<GitAutomationConfig>
  update: (
    input: UpdateGitAutomationInput
  ) => Effect.Effect<GitAutomation, Conflict, ProjectScope>
}>

export class ProjectGitAutomation extends Context.Service<
  ProjectGitAutomation,
  ProjectGitAutomationShape
>()("@pp/server-core/projects/ProjectGitAutomation") {}
