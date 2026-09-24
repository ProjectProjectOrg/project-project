import * as BunFileSystem from "@effect/platform-bun/BunFileSystem"
import * as BunPath from "@effect/platform-bun/BunPath"
import { DbLive, PgLive } from "@pp/db"
import { AttachmentsLive } from "@pp/server-core/attachments/AttachmentsLive"
import { AttachmentUploadsLive } from "@pp/server-core/attachments/AttachmentUploadsLive"
import { CommentsLive } from "@pp/server-core/comments/CommentsLive"
import { EverhourIntegrationsLive } from "@pp/server-core/everhour/EverhourIntegrationsLive"
import { EverhourLive } from "@pp/server-core/everhour/EverhourLive"
import { EverhourTimeTrackingLive } from "@pp/server-core/everhour/EverhourTimeTrackingLive"
import { FigmaIntegrationsLive } from "@pp/server-core/figma/FigmaIntegrationsLive"
import { FigmaLinksLive } from "@pp/server-core/figma/FigmaLinksLive"
import { FigmaLive } from "@pp/server-core/figma/FigmaLive"
import { GitHubIntegrationsLive } from "@pp/server-core/github/GitHubIntegrationsLive"
import { GitHubLive } from "@pp/server-core/github/GitHubLive"
import * as GitHubProjectStateCache from "@pp/server-core/github/projectStateCache"
import * as GitHubRequest from "@pp/server-core/github/request"
import { GroupDocsLive } from "@pp/server-core/groups/GroupDocsLive"
import { GroupsLive } from "@pp/server-core/groups/GroupsLive"
import { LibraryDocsLive } from "@pp/server-core/library/LibraryDocsLive"
import { LibraryLive } from "@pp/server-core/library/LibraryLive"
import { MarkdownLive } from "@pp/server-core/markdown/MarkdownLive"
import { OAuthApplicationsLive } from "@pp/server-core/oauth/OAuthApplicationsLive"
import { CurrentOrgLive } from "@pp/server-core/organizations/CurrentOrgLive"
import { OrgLive } from "@pp/server-core/organizations/OrgLive"
import { BannerPlaceholdersLive } from "@pp/server-core/projects/BannerPlaceholdersLive"
import { ProjectDocsLive } from "@pp/server-core/projects/ProjectDocsLive"
import { ProjectsLive } from "@pp/server-core/projects/ProjectsLive"
import { ProjectStatusesLive } from "@pp/server-core/projects/ProjectStatusesLive"
import { OrgStorageLive } from "@pp/server-core/storage/OrgStorageLive"
import { S3StorageLive } from "@pp/server-core/storage/S3StorageLive"
import { SecretCryptoLive } from "@pp/server-core/storage/SecretCryptoLive"
import { TagsLive } from "@pp/server-core/tags/TagsLive"
import { TicketDocsLive } from "@pp/server-core/tickets/TicketDocsLive"
import * as TicketDocumentLock from "@pp/server-core/tickets/ticketDocumentLock"
import { TicketIndexLive } from "@pp/server-core/tickets/TicketIndexLive"
import { TicketsLive } from "@pp/server-core/tickets/TicketsLive"
import { UsersLive } from "@pp/server-core/users/UsersLive"
import * as Layer from "effect/Layer"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"

import { AuthenticationLive } from "./Layers/Auth"
import { BetterAuthLive } from "./Layers/BetterAuth"

export const BackendInfrastructureLive = Layer.mergeAll(
  GitHubProjectStateCache.layer,
  GitHubRequest.layer,
  TicketDocumentLock.layer,
  BetterAuthLive,
  DbLive.pipe(Layer.provideMerge(PgLive)),
  BunFileSystem.layer,
  BunPath.layer,
  FetchHttpClient.layer,
  Layer.succeed(FetchHttpClient.Fetch, globalThis.fetch)
)

export const BackendServicesLive = TagsLive.pipe(
  Layer.provideMerge(ProjectStatusesLive),
  Layer.provideMerge(TicketsLive),
  Layer.provideMerge(LibraryLive),
  Layer.provideMerge(AttachmentUploadsLive),
  Layer.provideMerge(AttachmentsLive),
  Layer.provideMerge(FigmaLinksLive),
  Layer.provideMerge(CommentsLive),
  Layer.provideMerge(GroupsLive),
  Layer.provideMerge(ProjectsLive),
  Layer.provideMerge(CurrentOrgLive),
  Layer.provideMerge(OrgLive.pipe(Layer.provideMerge(CurrentOrgLive))),
  Layer.provideMerge(GitHubLive),
  Layer.provideMerge(EverhourLive)
)
  .pipe(
    Layer.provideMerge(
      GitHubIntegrationsLive.pipe(
        Layer.provideMerge(CurrentOrgLive),
        Layer.provideMerge(GitHubLive)
      )
    ),
    Layer.provideMerge(
      EverhourIntegrationsLive.pipe(Layer.provideMerge(EverhourLive))
    ),
    Layer.provideMerge(
      FigmaIntegrationsLive.pipe(Layer.provideMerge(FigmaLive))
    ),
    Layer.provideMerge(
      EverhourTimeTrackingLive.pipe(Layer.provideMerge(EverhourLive))
    ),
    Layer.provideMerge(BannerPlaceholdersLive),
    Layer.provideMerge(UsersLive),
    Layer.provideMerge(TicketIndexLive),
    Layer.provideMerge(ProjectDocsLive),
    Layer.provideMerge(TicketDocsLive),
    Layer.provideMerge(GroupDocsLive),
    Layer.provideMerge(LibraryDocsLive),
    Layer.provideMerge(MarkdownLive),
    Layer.provideMerge(OAuthApplicationsLive),
    Layer.provideMerge(SecretCryptoLive)
  )
  .pipe(
    Layer.provideMerge(S3StorageLive),
    Layer.provideMerge(
      OrgStorageLive.pipe(
        Layer.provideMerge(S3StorageLive),
        Layer.provideMerge(SecretCryptoLive),
        Layer.provideMerge(CurrentOrgLive)
      )
    )
  )

export const BackendHttpServicesLive = BackendServicesLive.pipe(
  Layer.provideMerge(AuthenticationLive)
)

export const BackendRuntimeLive = BackendServicesLive.pipe(
  Layer.provide(BackendInfrastructureLive)
)
