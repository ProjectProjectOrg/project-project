import type { NotFound, ProjectScopeShape } from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

import type { Bot } from "../bots/Bots"
import type { MarkdownError } from "../markdown/Markdown"
import type { SystemProjectRole } from "./systemProjectFrontmatter"

export type SystemProjectSpec = Readonly<{
  role: SystemProjectRole
  orgSlug: string
  name: string
  key: string
  bot: Bot
}>

export type SystemProjectsShape = Readonly<{
  ensure: (
    spec: SystemProjectSpec
  ) => Effect.Effect<ProjectScopeShape, NotFound | MarkdownError>
}>

export class SystemProjects extends Context.Service<
  SystemProjects,
  SystemProjectsShape
>()("@pp/server-core/projects/SystemProjects") {}
