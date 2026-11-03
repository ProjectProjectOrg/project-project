import * as BunCrypto from "@effect/platform-bun/BunCrypto"
import * as BunFileSystem from "@effect/platform-bun/BunFileSystem"
import * as BunPath from "@effect/platform-bun/BunPath"
import { DbLive, PgLive } from "@pp/db"
import { EverhourServicesLive } from "@pp/integration-everhour/Services"
import * as GitHubProjectStateCache from "@pp/integration-github/projectStateCache"
import * as GitHubRequest from "@pp/integration-github/request"
import * as JiraCleanupWorkflow from "@pp/integration-jira/CleanupWorkflow"
import * as Client from "@pp/integration-jira/Client"
import * as Credentials from "@pp/integration-jira/Credentials"
import * as MigrationArtifacts from "@pp/integration-jira/MigrationArtifacts"
import * as MigrationProjection from "@pp/integration-jira/MigrationProjection"
import * as Migrations from "@pp/integration-jira/Migrations"
import * as OAuthConfig from "@pp/integration-jira/OAuthConfig"
import { JiraMigrationRetentionLive } from "@pp/integration-jira/Retention"
import * as TokenEndpoint from "@pp/integration-jira/TokenEndpoint"
import * as Transport from "@pp/integration-jira/Transport"
import { SlackServicesLive } from "@pp/integration-slack/Services"
import * as Access from "@pp/server-core/access/Access"
import * as TicketActivity from "@pp/server-core/activity/TicketActivity"
import * as TicketActivityFeed from "@pp/server-core/activity/TicketActivityFeed"
import * as Attachments from "@pp/server-core/attachments/Attachments"
import * as AttachmentUploads from "@pp/server-core/attachments/AttachmentUploads"
import * as Bots from "@pp/server-core/bots/Bots"
import * as Comments from "@pp/server-core/comments/Comments"
import { OrgEmail } from "@pp/server-core/email/OrgEmail"
import { Smtp } from "@pp/server-core/email/Smtp"
import { FeedbackAttachments } from "@pp/server-core/feedback/FeedbackAttachments"
import * as FeedbackConfig from "@pp/server-core/feedback/FeedbackConfig"
import {
  FeedbackDelivery,
  FeedbackDeliveryWorkflowLive
} from "@pp/server-core/feedback/FeedbackDelivery"
import * as FeedbackIntake from "@pp/server-core/feedback/FeedbackIntake"
import * as Figma from "@pp/server-core/figma/Figma"
import * as FigmaIntegrations from "@pp/server-core/figma/FigmaIntegrations"
import * as FigmaLinks from "@pp/server-core/figma/FigmaLinks"
import * as GitHubTicketEvents from "@pp/server-core/github/GitHubTicketEvents"
import * as GroupDocs from "@pp/server-core/groups/GroupDocs"
import * as Groups from "@pp/server-core/groups/Groups"
import * as Library from "@pp/server-core/library/Library"
import * as LibraryDocs from "@pp/server-core/library/LibraryDocs"
import * as LinkPreviews from "@pp/server-core/linkPreviews/LinkPreviews"
import * as LiveChanges from "@pp/server-core/live/LiveChanges"
import * as LiveFeed from "@pp/server-core/live/LiveFeed"
import * as KeyedLock from "@pp/server-core/locks/KeyedLock"
import * as Markdown from "@pp/server-core/markdown/Markdown"
import * as OAuthApplications from "@pp/server-core/oauth/OAuthApplications"
import * as Org from "@pp/server-core/organizations/Org"
import * as BannerPlaceholders from "@pp/server-core/projects/BannerPlaceholders"
import { FinishedStatuses } from "@pp/server-core/projects/FinishedStatuses"
import * as ProjectServices from "@pp/server-core/projects/layer"
import * as ProjectDocs from "@pp/server-core/projects/ProjectDocs"
import * as ProjectGitAutomation from "@pp/server-core/projects/ProjectGitAutomation"
import * as ProjectStatuses from "@pp/server-core/projects/ProjectStatuses"
import * as SystemProjects from "@pp/server-core/projects/SystemProjects"
import * as OrgStorage from "@pp/server-core/storage/OrgStorage"
import * as S3Storage from "@pp/server-core/storage/S3Storage"
import * as SecretCrypto from "@pp/server-core/storage/SecretCrypto"
import * as Tags from "@pp/server-core/tags/Tags"
import * as TicketIndexServices from "@pp/server-core/tickets/indexLayer"
import * as TicketServices from "@pp/server-core/tickets/layer"
import * as TicketBranchIndex from "@pp/server-core/tickets/TicketBranchIndex"
import * as TicketDocs from "@pp/server-core/tickets/TicketDocs"
import * as TicketDocumentLock from "@pp/server-core/tickets/ticketDocumentLock"
import * as TicketRewrites from "@pp/server-core/tickets/TicketRewrites"
import * as Users from "@pp/server-core/users/Users"
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
  Layer.provideMerge(Access.layer),
  Layer.provideMerge(Users.layer)
)

const FeedbackLive = FeedbackDeliveryWorkflowLive.pipe(
  Layer.provideMerge(FeedbackDelivery.layer),
  Layer.provideMerge(FeedbackAttachments.layer),
  Layer.provideMerge(Bots.layer),
  Layer.provideMerge(FeedbackConfig.layer)
)

const EverhourIntegrationLive = EverhourServicesLive.pipe(
  Layer.provideMerge(EverhourHostLive),
  Layer.provideMerge(Access.layer)
)

const makeJiraServicesLive = <TE, TR, EE, ER, CE, CR>(
  transport: Layer.Layer<Transport.JiraTransport, TE, TR>,
  tokenEndpoint: Layer.Layer<TokenEndpoint.JiraTokenEndpoint, EE, ER>,
  oauthConfig: Layer.Layer<OAuthConfig.JiraOAuthConfig, CE, CR>
) =>
  Client.layer.pipe(
    Layer.provideMerge(transport),
    Layer.provideMerge(
      Credentials.layer.pipe(
        Layer.provideMerge(tokenEndpoint.pipe(Layer.provideMerge(oauthConfig))),
        Layer.provideMerge(JiraHostLive.pipe(Layer.provide(SecretCrypto.layer)))
      )
    )
  )

const JiraDurableServicesLive = Layer.unwrap(
  Effect.gen(function* () {
    const cleanup = yield* JiraCleanupWorkflow.makeJiraCleanupCommands
    const projection = yield* MigrationProjection.JiraMigrationProjection
    const artifacts = yield* MigrationArtifacts.JiraMigrationArtifacts
    return Layer.mergeAll(
      Migrations.layer(
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
  LiveChanges.layer,
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
  transport: Layer.Layer<Transport.JiraTransport, TE, TR>,
  tokenEndpoint: Layer.Layer<TokenEndpoint.JiraTokenEndpoint, EE, ER>,
  oauthConfig: Layer.Layer<OAuthConfig.JiraOAuthConfig, CE, CR>
) =>
  Tags.layer
    .pipe(
      Layer.provideMerge(FeedbackIntake.layer),
      Layer.provideMerge(SystemProjects.layer),
      Layer.provideMerge(ProjectStatuses.layer),
      Layer.provideMerge(TicketServices.layer),
      Layer.provideMerge(TicketActivityFeed.layer),
      Layer.provideMerge(Library.layer),
      Layer.provideMerge(AttachmentUploads.layer),
      Layer.provideMerge(Attachments.layer),
      Layer.provideMerge(FigmaLinks.layer),
      Layer.provideMerge(LinkPreviews.layer),
      Layer.provideMerge(Comments.layer),
      Layer.provideMerge(Groups.layer),
      Layer.provideMerge(ProjectServices.layer),
      Layer.provideMerge(Org.layer),
      Layer.provideMerge(LiveFeed.layer),
      Layer.provideMerge(Access.layer),
      Layer.provideMerge(GitHubLive),
      Layer.provideMerge(GitHubTicketEvents.layer),
      Layer.provideMerge(ProjectGitAutomation.layer)
    )
    .pipe(
      Layer.provideMerge(EverhourIntegrationLive),
      Layer.provideMerge(
        FigmaIntegrations.layer.pipe(Layer.provideMerge(Figma.layer))
      ),
      Layer.provideMerge(BannerPlaceholders.layer),
      Layer.provideMerge(Users.layer),
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
      Layer.provideMerge(TicketActivity.layer),
      Layer.provideMerge(LibraryDocs.layer),
      Layer.provideMerge(Markdown.layer),
      Layer.provideMerge(OAuthApplications.layer),
      Layer.provideMerge(SecretCrypto.layer),
      Layer.provideMerge(
        makeJiraServicesLive(transport, tokenEndpoint, oauthConfig)
      )
    )
    .pipe(
      Layer.provideMerge(S3Storage.layer),
      Layer.provideMerge(
        OrgEmail.layer.pipe(
          Layer.provide(Smtp.layer),
          Layer.provide(SecretCrypto.layer)
        )
      ),
      Layer.provideMerge(
        OrgStorage.layer.pipe(
          Layer.provideMerge(S3Storage.layer),
          Layer.provideMerge(SecretCrypto.layer)
        )
      )
    )

export const BackendServicesLive = makeBackendServicesLive(
  Transport.layer,
  TokenEndpoint.layer,
  OAuthConfig.layer
)

export const makeBackendHttpServicesLive = <TE, TR, EE, ER, CE, CR>(
  transport: Layer.Layer<Transport.JiraTransport, TE, TR>,
  tokenEndpoint: Layer.Layer<TokenEndpoint.JiraTokenEndpoint, EE, ER>,
  oauthConfig: Layer.Layer<OAuthConfig.JiraOAuthConfig, CE, CR>
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
  Transport.layer,
  TokenEndpoint.layer,
  OAuthConfig.layer
)

export const BackendRuntimeLive = BackendServicesLive.pipe(
  Layer.provide(BackendInfrastructureLive)
)

export { JiraWorkflowsLive } from "./jira/WorkflowRuntime"
export { WorkflowEngineLive } from "./workflows/Runtime"
