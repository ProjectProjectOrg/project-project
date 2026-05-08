import { Layer } from "effect"
import { AuthenticationLive } from "./Layers/Auth"
import { BetterAuthLive } from "./Layers/BetterAuth"
import { CurrentOrgLive } from "./Layers/CurrentOrg"
import { DbLive } from "./Layers/Db"
import { GitHubLive } from "./Layers/GitHub"
import { GroupsLive } from "./Layers/Groups"
import { MarkdownLive } from "./Layers/Markdown"
import { ProjectsLive } from "./Layers/Projects"
import { TagsLive } from "./Layers/Tags"
import { TicketsLive } from "./Layers/Tickets"
import { UsersLive } from "./Layers/Users"

export const BackendInfrastructureLive = Layer.mergeAll(BetterAuthLive, DbLive)

export const BackendServicesLive = TagsLive.pipe(
  Layer.provideMerge(TicketsLive),
  Layer.provideMerge(GroupsLive),
  Layer.provideMerge(ProjectsLive),
  Layer.provideMerge(CurrentOrgLive),
  Layer.provideMerge(GitHubLive),
  Layer.provideMerge(UsersLive),
  Layer.provideMerge(MarkdownLive)
)

export const BackendHttpServicesLive = BackendServicesLive.pipe(
  Layer.provideMerge(AuthenticationLive)
)

export const BackendRuntimeLive = BackendServicesLive.pipe(
  Layer.provide(BackendInfrastructureLive)
)
