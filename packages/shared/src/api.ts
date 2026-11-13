import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  OpenApi
} from "effect/http-api"
import * as Schema from "effect/Schema"

import { AttachmentsGroup } from "./attachments/AttachmentsApi"
import {
  AuthGroup,
  OAuthApplicationsGroup,
  PublicAuthGroup,
  PublicOAuthGroup
} from "./auth/AuthApi"
import { TicketCommentsGroup } from "./comments/CommentsApi"
import { EverhourGroup } from "./everhour/EverhourApi"
import { FeedbackGroup, FeedbackIntakeGroup } from "./feedback/FeedbackApi"
import { FigmaGroup } from "./figma/FigmaApi"
import { GitAutomationGroup } from "./github/GitAutomationApi"
import { GroupsGroup } from "./groups/GroupsApi"
import { InboxGroup } from "./inbox/InboxApi"
import { JiraGroup, JiraMigrationsGroup } from "./jira/JiraApi"
import { LibraryGroup } from "./library/LibraryApi"
import { LinkPreviewsGroup } from "./linkPreviews/LinkPreviewsApi"
import {
  InvitationsGroup,
  OrgEmailGroup,
  OrgGroup
} from "./organizations/OrgApi"
import { ProjectsGroup } from "./projects/ProjectsApi"
import { SlackGroup } from "./slack/SlackApi"
import { StatusesGroup } from "./statuses/StatusesApi"
import { StorageGroup } from "./storage/StorageApi"
import { TicketSubscriptionsGroup } from "./subscriptions/SubscriptionsApi"
import { TagsGroup } from "./tags/TagsApi"
import { TicketActivityGroup, TicketsGroup } from "./tickets/TicketsApi"

const HealthResponse = Schema.Struct({
  status: Schema.Literal("ok"),
  version: Schema.String
})

export type HealthResponse = typeof HealthResponse.Type

const HealthGroup = HttpApiGroup.make("health").add(
  HttpApiEndpoint.get("get", "/health", {
    success: HealthResponse
  })
)

const DbPingResponse = Schema.Struct({
  projectCount: Schema.Finite
})

export type DbPingResponse = typeof DbPingResponse.Type

const DbGroup = HttpApiGroup.make("db").add(
  HttpApiEndpoint.get("ping", "/db/ping", {
    success: DbPingResponse
  })
)

export const AppApi = HttpApi.make("projectproject")
  .add(HealthGroup)
  .add(DbGroup)
  .add(AuthGroup)
  .add(OrgGroup)
  .add(InvitationsGroup)
  .add(ProjectsGroup)
  .add(EverhourGroup)
  .add(FigmaGroup)
  .add(LinkPreviewsGroup)
  .add(JiraGroup)
  .add(JiraMigrationsGroup)
  .add(StorageGroup)
  .add(OrgEmailGroup)
  .add(SlackGroup)
  .add(AttachmentsGroup)
  .add(TicketsGroup)
  .add(TicketCommentsGroup)
  .add(TicketActivityGroup)
  .add(TicketSubscriptionsGroup)
  .add(InboxGroup)
  .add(TagsGroup)
  .add(StatusesGroup)
  .add(GitAutomationGroup)
  .add(GroupsGroup)
  .add(LibraryGroup)
  .add(OAuthApplicationsGroup)
  .add(PublicOAuthGroup)
  .add(PublicAuthGroup)
  .add(FeedbackGroup)
  .add(FeedbackIntakeGroup)
  .annotateMerge(OpenApi.annotations({ servers: [{ url: "/api" }] }))
