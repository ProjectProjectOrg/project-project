import type { NotFound, ProjectScopeShape, Role } from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

export type Bot = Readonly<{
  key: string
  name: string
  role: Role
}>

export type BotsShape = Readonly<{
  ensure: (bot: Bot) => Effect.Effect<string>
  projectScope: (
    bot: Bot,
    orgSlug: string,
    slug: string
  ) => Effect.Effect<ProjectScopeShape, NotFound>
}>

export class Bots extends Context.Service<Bots, BotsShape>()(
  "@pp/server-core/bots/Bots"
) {}
