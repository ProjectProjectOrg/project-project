import * as BunFileSystem from "@effect/platform-bun/BunFileSystem"
import * as BunPath from "@effect/platform-bun/BunPath"
import * as Layer from "effect/Layer"
import * as Effect from "effect/Effect"
import { FetchHttpClient } from "effect/unstable/http"
import { AttachmentUploadsLive } from "./Layers/AttachmentUploads"
import { AttachmentsLive } from "./Layers/Attachments"
import { AuthenticationLive } from "./Layers/Auth"
import { BannerPlaceholdersLive } from "./Layers/BannerPlaceholders"
import { BetterAuthLive } from "./Layers/BetterAuth"
import { CommentsLive } from "./Layers/Comments"
import { CurrentOrgLive } from "./Layers/CurrentOrg"
import { DbLive, PgLive } from "./Layers/Db"
import { EverhourLive } from "./Layers/Everhour"
import { EverhourIntegrationsLive } from "./Layers/EverhourIntegrations"
import { EverhourTimeTrackingLive } from "./Layers/EverhourTimeTracking"
import { FigmaLive } from "./Layers/Figma"
import { FigmaIntegrationsLive } from "./Layers/FigmaIntegrations"
import { FigmaLinksLive } from "./Layers/FigmaLinks"
import { GitHubLive } from "./Layers/GitHub"
import * as GitHubProjectStateCache from "./Layers/GitHub/projectStateCache"
import * as GitHubRequest from "./Layers/GitHub/request"
import * as TicketDocumentLock from "./ticketDocumentLock"
import { GitHubIntegrationsLive } from "./Layers/GitHubIntegrations"
import { GroupDocsLive } from "./Layers/GroupDocs"
import { GroupsLive } from "./Layers/Groups"
import { MarkdownLive } from "./Layers/Markdown"
import { OAuthApplicationsLive } from "./Layers/OAuthApplications"
import { OrgLive } from "./Layers/Org"
import { OrgStorageLive } from "./Layers/OrgStorage"
import { ProjectDocsLive } from "./Layers/ProjectDocs"
import { ProjectsLive } from "./Layers/Projects"
import { ProjectStatusesLive } from "./Layers/ProjectStatuses"
import { S3StorageLive } from "./Layers/S3Storage"
import { SecretCryptoLive } from "./Layers/SecretCrypto"
import { TagsLive } from "./Layers/Tags"
import { TicketIndexLive } from "./Layers/TicketIndex"
import { TicketDocsLive } from "./Layers/TicketDocs"
import { TicketsLive } from "./Layers/Tickets"
import { UsersLive } from "./Layers/Users"
import { JiraClientLive, JiraTransport, JiraTransportLive } from "./Jira/Client"
import { JiraCredentialsLive } from "./Jira/Credentials"
import {
  JiraOAuthConfig,
  JiraOAuthConfigLive,
  JiraTokenEndpoint,
  JiraTokenEndpointLive
} from "./Jira/OAuth"
import { JiraMigrationsDurableLive } from "./Jira/Migrations"
import * as JiraCleanupWorkflow from "./Jira/CleanupWorkflow"
import { JiraMigrationProjection } from "./Jira/MigrationProjection"
import { JiraMigrationRetentionLive } from "./Jira/Retention"
import { JiraWorkflowsLive } from "./Jira/WorkflowRuntime"

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
    return Layer.mergeAll(
      JiraMigrationsDurableLive(cleanup, {
        unresolvedFailedAttachments: projection.unresolvedFailedAttachments
      }),
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
} from "./Jira/WorkflowRuntime"
