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
import * as JiraCleanupWorkflow from "@pp/server-core/jira/CleanupWorkflow"
import {
  JiraClientLive,
  JiraTransport,
  JiraTransportLive
} from "@pp/server-core/jira/Client"
import { JiraCredentialsLive } from "@pp/server-core/jira/Credentials"
import { JiraMigrationArtifacts } from "@pp/server-core/jira/MigrationArtifacts"
import { JiraMigrationProjection } from "@pp/server-core/jira/MigrationProjection"
import { JiraMigrationsDurableLive } from "@pp/server-core/jira/Migrations"
import {
  JiraOAuthConfig,
  JiraOAuthConfigLive,
  JiraTokenEndpoint,
  JiraTokenEndpointLive
} from "@pp/server-core/jira/OAuth"
import { JiraMigrationRetentionLive } from "@pp/server-core/jira/Retention"
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
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"

import { JiraWorkflowsLive } from "./jira/WorkflowRuntime"
import { AuthenticationLive } from "./Layers/Auth"
import { BetterAuthLive } from "./Layers/BetterAuth"

const makeJiraServicesLive = <TE, TR, EE, ER, CE, CR>(
  transport: Layer.Layer<JiraTransport, TE, TR>,
  tokenEndpoint: Layer.Layer<JiraTokenEndpoint, EE, ER>,
  oauthConfig: Layer.Layer<JiraOAuthConfig, CE, CR>
) =>
  JiraClientLive.pipe(
    Layer.provideMerge(transport),
    Layer.provideMerge(
      JiraCredentialsLive.pipe(
        Layer.provideMerge(tokenEndpoint.pipe(Layer.provideMerge(oauthConfig))),
        Layer.provideMerge(SecretCryptoLive)
      )
    )
  )

const JiraDurableServicesLive = Layer.unwrap(
  Effect.gen(function* () {
    const cleanup = yield* JiraCleanupWorkflow.makeJiraCleanupCommands
    const projection = yield* JiraMigrationProjection
    const artifacts = yield* JiraMigrationArtifacts
    return Layer.mergeAll(
      JiraMigrationsDurableLive(
        cleanup,
        {
          unresolvedFailedAttachments: projection.unresolvedFailedAttachments
        },
        artifacts
      ),
      JiraMigrationRetentionLive(cleanup)
    )
  })
)

export const BackendInfrastructureLive = Layer.mergeAll(
  GitHubProjectStateCache.layer,
  GitHubRequest.layer,
  TicketDocumentLock.layer,
  BetterAuthLive,
  DbLive.pipe(Layer.provideMerge(PgLive)),
  FetchHttpClient.layer,
  Layer.succeed(FetchHttpClient.Fetch, globalThis.fetch),
  BunFileSystem.layer,
  BunPath.layer
)

export const makeBackendServicesLive = <TE, TR, EE, ER, CE, CR>(
  transport: Layer.Layer<JiraTransport, TE, TR>,
  tokenEndpoint: Layer.Layer<JiraTokenEndpoint, EE, ER>,
  oauthConfig: Layer.Layer<JiraOAuthConfig, CE, CR>
) =>
  TagsLive.pipe(
    Layer.provideMerge(ProjectStatusesLive),
    Layer.provideMerge(TicketsLive),
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
      Layer.provideMerge(JiraDurableServicesLive),
      Layer.provideMerge(JiraWorkflowsLive),
      Layer.provideMerge(ProjectDocsLive),
      Layer.provideMerge(TicketDocsLive),
      Layer.provideMerge(GroupDocsLive),
      Layer.provideMerge(MarkdownLive),
      Layer.provideMerge(OAuthApplicationsLive),
      Layer.provideMerge(SecretCryptoLive),
      Layer.provideMerge(
        makeJiraServicesLive(transport, tokenEndpoint, oauthConfig)
      )
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

export const BackendServicesLive = makeBackendServicesLive(
  JiraTransportLive,
  JiraTokenEndpointLive,
  JiraOAuthConfigLive
)

export const makeBackendHttpServicesLive = <TE, TR, EE, ER, CE, CR>(
  transport: Layer.Layer<JiraTransport, TE, TR>,
  tokenEndpoint: Layer.Layer<JiraTokenEndpoint, EE, ER>,
  oauthConfig: Layer.Layer<JiraOAuthConfig, CE, CR>
) =>
  makeBackendServicesLive(transport, tokenEndpoint, oauthConfig).pipe(
    Layer.provideMerge(AuthenticationLive)
  )

export const BackendHttpServicesLive = makeBackendHttpServicesLive(
  JiraTransportLive,
  JiraTokenEndpointLive,
  JiraOAuthConfigLive
)

export const BackendRuntimeLive = BackendServicesLive.pipe(
  Layer.provide(BackendInfrastructureLive)
)

export {
  JiraWorkflowEngineLive,
  JiraWorkflowsLive
} from "./jira/WorkflowRuntime"
