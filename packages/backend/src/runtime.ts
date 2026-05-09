import { BunContext } from "@effect/platform-bun"
import * as Layer from "effect/Layer"
import { AuthenticationLive } from "./Layers/Auth"
import { BetterAuthLive } from "./Layers/BetterAuth"
import { CommentsLive } from "./Layers/Comments"
import { CurrentOrgLive } from "./Layers/CurrentOrg"
import { DbLive } from "./Layers/Db"
import { GitHubLive } from "./Layers/GitHub"
import { GroupDocsLive } from "./Layers/GroupDocs"
import { GroupsLive } from "./Layers/Groups"
import { MarkdownLive } from "./Layers/Markdown"
import { ProjectDocsLive } from "./Layers/ProjectDocs"
import { ProjectsLive } from "./Layers/Projects"
import { TagsLive } from "./Layers/Tags"
import { TicketDocsLive } from "./Layers/TicketDocs"
import { TicketsLive } from "./Layers/Tickets"
import { UsersLive } from "./Layers/Users"

export const BackendInfrastructureLive = Layer.mergeAll(
  BetterAuthLive,
  DbLive,
  BunContext.layer
)

export const BackendServicesLive = TagsLive.pipe(
  Layer.provideMerge(CommentsLive),
  Layer.provideMerge(TicketsLive),
  Layer.provideMerge(GroupsLive),
  Layer.provideMerge(ProjectsLive),
  Layer.provideMerge(CurrentOrgLive),
  Layer.provideMerge(GitHubLive),
  Layer.provideMerge(UsersLive),
  Layer.provideMerge(ProjectDocsLive),
  Layer.provideMerge(TicketDocsLive),
  Layer.provideMerge(GroupDocsLive),
  Layer.provideMerge(MarkdownLive)
)

export const BackendHttpServicesLive = BackendServicesLive.pipe(
  Layer.provideMerge(AuthenticationLive)
)

export const BackendRuntimeLive = BackendServicesLive.pipe(
  Layer.provide(BackendInfrastructureLive)
)
