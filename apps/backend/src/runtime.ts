import * as BunCrypto from "@effect/platform-bun/BunCrypto"
import * as BunFileSystem from "@effect/platform-bun/BunFileSystem"
import * as BunPath from "@effect/platform-bun/BunPath"
import { DbLive, PgLive } from "@pp/db"
import { EverhourServicesLive } from "@pp/integration-everhour/Services"
import * as GitHubProjectStateCache from "@pp/integration-github/projectStateCache"
import * as GitHubRequest from "@pp/integration-github/request"
import * as JiraCleanupWorkflow from "@pp/integration-jira/CleanupWorkflow"
import {
  JiraClientLive,
  JiraTransport,
  JiraTransportLive
} from "@pp/integration-jira/Client"
import { JiraCredentialsLive } from "@pp/integration-jira/Credentials"
import { JiraMigrationArtifacts } from "@pp/integration-jira/MigrationArtifacts"
import { JiraMigrationProjection } from "@pp/integration-jira/MigrationProjection"
import { JiraMigrationsDurableLive } from "@pp/integration-jira/Migrations"
import {
  JiraOAuthConfig,
  JiraOAuthConfigLive,
  JiraTokenEndpoint,
  JiraTokenEndpointLive
} from "@pp/integration-jira/OAuth"
import { JiraMigrationRetentionLive } from "@pp/integration-jira/Retention"
import { SlackServicesLive } from "@pp/integration-slack/Services"
import { AccessLive } from "@pp/server-core/access/AccessLive"
import { TicketActivityFeedLive } from "@pp/server-core/activity/TicketActivityFeed"
import { TicketActivityLive } from "@pp/server-core/activity/TicketActivityLive"
import * as Attachments from "@pp/server-core/attachments/Attachments"
import { AttachmentUploadsLive } from "@pp/server-core/attachments/AttachmentUploadsLive"
import { BotsLive } from "@pp/server-core/bots/BotsLive"
import { CommentsLive } from "@pp/server-core/comments/CommentsLive"
import { OrgEmail } from "@pp/server-core/email/OrgEmail"
import { Smtp } from "@pp/server-core/email/Smtp"
import { FeedbackAttachments } from "@pp/server-core/feedback/FeedbackAttachments"
import { FeedbackConfig } from "@pp/server-core/feedback/FeedbackConfig"
import {
  FeedbackDelivery,
  FeedbackDeliveryWorkflowLive
} from "@pp/server-core/feedback/FeedbackDelivery"
import { FeedbackIntake } from "@pp/server-core/feedback/FeedbackIntake"
import * as Figma from "@pp/server-core/figma/Figma"
import * as FigmaIntegrations from "@pp/server-core/figma/FigmaIntegrations"
import * as FigmaLinks from "@pp/server-core/figma/FigmaLinks"
import { GitHubTicketEventsLive } from "@pp/server-core/github/GitHubTicketEventsLive"
import * as GroupDocs from "@pp/server-core/groups/GroupDocs"
import * as Groups from "@pp/server-core/groups/Groups"
import * as Library from "@pp/server-core/library/Library"
import * as LibraryDocs from "@pp/server-core/library/LibraryDocs"
import { LinkPreviewsLive } from "@pp/server-core/linkPreviews/LinkPreviewsLive"
import * as KeyedLock from "@pp/server-core/locks/KeyedLock"
import { MarkdownLive } from "@pp/server-core/markdown/MarkdownLive"
import { OAuthApplicationsLive } from "@pp/server-core/oauth/OAuthApplicationsLive"
import { OrgLive } from "@pp/server-core/organizations/OrgLive"
import * as BannerPlaceholders from "@pp/server-core/projects/BannerPlaceholders"
import { FinishedStatuses } from "@pp/server-core/projects/FinishedStatuses"
import * as ProjectServices from "@pp/server-core/projects/layer"
import * as ProjectDocs from "@pp/server-core/projects/ProjectDocs"
import * as ProjectGitAutomation from "@pp/server-core/projects/ProjectGitAutomation"
import * as ProjectStatuses from "@pp/server-core/projects/ProjectStatuses"
import * as SystemProjects from "@pp/server-core/projects/SystemProjects"
import { OrgStorageLive } from "@pp/server-core/storage/OrgStorageLive"
import { S3StorageLive } from "@pp/server-core/storage/S3StorageLive"
import { SecretCryptoLive } from "@pp/server-core/storage/SecretCryptoLive"
import { TagsLive } from "@pp/server-core/tags/TagsLive"
import * as TicketIndexServices from "@pp/server-core/tickets/indexLayer"
import * as TicketServices from "@pp/server-core/tickets/layer"
import * as TicketBranchIndex from "@pp/server-core/tickets/TicketBranchIndex"
import * as TicketDocs from "@pp/server-core/tickets/TicketDocs"
import * as TicketDocumentLock from "@pp/server-core/tickets/ticketDocumentLock"
import * as TicketRewrites from "@pp/server-core/tickets/TicketRewrites"
import { UsersLive } from "@pp/server-core/users/UsersLive"
import * as Effect from "effect/Effect"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as Layer from "effect/Layer"

import { EverhourHostLive } from "./everhour/HostLive"
import { GitHubLive } from "./github/GitHubLive"
import { JiraDestinationQueriesLive } from "./jira/DestinationQueriesLive"
import { JiraHostLive } from "./jira/HostLive"
import { JiraWorkflowsLive } from "./jira/WorkflowRuntime"
import { OrgAccessLive, ProjectAccessLive } from "./Layers/Access"
import { AuthenticationLive } from "./Layers/Auth"
import { BetterAuthLive } from "./Layers/BetterAuth"
import { FeedbackIntakeGuardLive } from "./Layers/FeedbackIntakeGuard"
import { SlackHostLive } from "./slack/HostLive"

const SlackLive = SlackServicesLive.pipe(
  Layer.provideMerge(SlackHostLive),
  Layer.provideMerge(AccessLive),
  Layer.provideMerge(UsersLive)
)

const FeedbackLive = FeedbackDeliveryWorkflowLive.pipe(
  Layer.provideMerge(FeedbackDelivery.layer),
  Layer.provideMerge(FeedbackAttachments.layer),
  Layer.provideMerge(BotsLive),
  Layer.provideMerge(FeedbackConfig.layer)
)

const EverhourIntegrationLive = EverhourServicesLive.pipe(
  Layer.provideMerge(EverhourHostLive),
  Layer.provideMerge(AccessLive)
)

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
        Layer.provideMerge(JiraHostLive.pipe(Layer.provide(SecretCryptoLive)))
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
      ).pipe(Layer.provide(JiraDestinationQueriesLive)),
      JiraMigrationRetentionLive(cleanup)
    )
  })
)

export const BackendInfrastructureLive = Layer.mergeAll(
  KeyedLock.layer,
  GitHubProjectStateCache.layer,
  GitHubRequest.layer,
  TicketDocumentLock.layer,
  BetterAuthLive,
  DbLive.pipe(Layer.provideMerge(PgLive)),
  FetchHttpClient.layer,
  Layer.succeed(FetchHttpClient.Fetch, globalThis.fetch),
  BunFileSystem.layer,
  BunPath.layer,
  BunCrypto.layer
)

export const makeBackendServicesLive = <TE, TR, EE, ER, CE, CR>(
  transport: Layer.Layer<JiraTransport, TE, TR>,
  tokenEndpoint: Layer.Layer<JiraTokenEndpoint, EE, ER>,
  oauthConfig: Layer.Layer<JiraOAuthConfig, CE, CR>
) =>
  TagsLive.pipe(
    Layer.provideMerge(FeedbackIntake.layer),
    Layer.provideMerge(SystemProjects.layer),
    Layer.provideMerge(ProjectStatuses.layer),
    Layer.provideMerge(TicketServices.layer),
    Layer.provideMerge(TicketActivityFeedLive),
    Layer.provideMerge(Library.layer),
    Layer.provideMerge(AttachmentUploadsLive),
    Layer.provideMerge(Attachments.layer),
    Layer.provideMerge(FigmaLinks.layer),
    Layer.provideMerge(LinkPreviewsLive),
    Layer.provideMerge(CommentsLive),
    Layer.provideMerge(Groups.layer),
    Layer.provideMerge(ProjectServices.layer),
    Layer.provideMerge(OrgLive),
    Layer.provideMerge(AccessLive),
    Layer.provideMerge(GitHubLive),
    Layer.provideMerge(GitHubTicketEventsLive),
    Layer.provideMerge(ProjectGitAutomation.layer)
  )
    .pipe(
      Layer.provideMerge(EverhourIntegrationLive),
      Layer.provideMerge(
        FigmaIntegrations.layer.pipe(Layer.provideMerge(Figma.layer))
      ),
      Layer.provideMerge(BannerPlaceholders.layer),
      Layer.provideMerge(UsersLive),
      Layer.provideMerge(
        TicketRewrites.layer.pipe(Layer.provideMerge(TicketIndexServices.layer))
      ),
      Layer.provideMerge(TicketBranchIndex.layer),
      Layer.provideMerge(SlackLive),
      Layer.provideMerge(FeedbackLive),
      Layer.provideMerge(JiraDurableServicesLive),
      Layer.provideMerge(JiraWorkflowsLive),
      Layer.provideMerge(ProjectDocs.layer),
      Layer.provideMerge(TicketDocs.layer),
      Layer.provideMerge(FinishedStatuses.layer),
      Layer.provideMerge(GroupDocs.layer),
      Layer.provideMerge(TicketActivityLive),
      Layer.provideMerge(LibraryDocs.layer),
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
        OrgEmail.layer.pipe(
          Layer.provide(Smtp.layer),
          Layer.provide(SecretCryptoLive)
        )
      ),
      Layer.provideMerge(
        OrgStorageLive.pipe(
          Layer.provideMerge(S3StorageLive),
          Layer.provideMerge(SecretCryptoLive)
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
  Layer.mergeAll(
    AuthenticationLive,
    OrgAccessLive,
    ProjectAccessLive,
    FeedbackIntakeGuardLive
  ).pipe(
    Layer.provideMerge(
      makeBackendServicesLive(transport, tokenEndpoint, oauthConfig)
    )
  )

export const BackendHttpServicesLive = makeBackendHttpServicesLive(
  JiraTransportLive,
  JiraTokenEndpointLive,
  JiraOAuthConfigLive
)

export const BackendRuntimeLive = BackendServicesLive.pipe(
  Layer.provide(BackendInfrastructureLive)
)

export { JiraWorkflowsLive } from "./jira/WorkflowRuntime"
export { WorkflowEngineLive } from "./workflows/Runtime"
