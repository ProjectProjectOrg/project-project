import { BunContext } from "@effect/platform-bun"
import * as Layer from "effect/Layer"
import { AuthenticationLive } from "./Layers/Auth"
import { BetterAuthLive } from "./Layers/BetterAuth"
import { CommentsLive } from "./Layers/Comments"
import { CurrentOrgLive } from "./Layers/CurrentOrg"
import { DbLive, PgLive } from "./Layers/Db"
import { GitHubLive } from "./Layers/GitHub"
import { GitHubIntegrationsLive } from "./Layers/GitHubIntegrations"
import { GroupDocsLive } from "./Layers/GroupDocs"
import { GroupsLive } from "./Layers/Groups"
import { MarkdownLive } from "./Layers/Markdown"
import { OAuthApplicationsLive } from "./Layers/OAuthApplications"
import { ProjectDocsLive } from "./Layers/ProjectDocs"
import { ProjectsLive } from "./Layers/Projects"
import { ReviewsLive } from "./Layers/Reviews"
import { TagsLive } from "./Layers/Tags"
import { TicketDocsLive } from "./Layers/TicketDocs"
import { TicketsLive } from "./Layers/Tickets"
import { UsersLive } from "./Layers/Users"

export const BackendInfrastructureLive = Layer.mergeAll(
  BetterAuthLive,
  DbLive.pipe(Layer.provideMerge(PgLive)),
  BunContext.layer
)

export const BackendServicesLive = TagsLive.pipe(
  Layer.provideMerge(CommentsLive),
  Layer.provideMerge(ReviewsLive),
  Layer.provideMerge(TicketsLive),
  Layer.provideMerge(GroupsLive),
  Layer.provideMerge(ProjectsLive),
  Layer.provideMerge(CurrentOrgLive),
  Layer.provideMerge(GitHubLive),
  Layer.provideMerge(
    GitHubIntegrationsLive.pipe(
      Layer.provideMerge(CurrentOrgLive),
      Layer.provideMerge(GitHubLive)
    )
  ),
  Layer.provideMerge(UsersLive),
  Layer.provideMerge(ProjectDocsLive),
  Layer.provideMerge(TicketDocsLive),
  Layer.provideMerge(GroupDocsLive),
  Layer.provideMerge(MarkdownLive),
  Layer.provideMerge(OAuthApplicationsLive)
)

export const BackendHttpServicesLive = BackendServicesLive.pipe(
  Layer.provideMerge(AuthenticationLive)
)

export const BackendRuntimeLive = BackendServicesLive.pipe(
  Layer.provide(BackendInfrastructureLive)
)
