import {
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSchema
} from "effect/http-api"

import { OrgAccess, RequiresOrg } from "../access/OrgAccess"
import { Authentication } from "../auth/Authentication"
import {
  AttachmentTooLarge,
  AttachmentTypeRejected,
  Conflict,
  Forbidden,
  NotFound,
  RateLimited,
  StorageConfigMissing,
  StorageError,
  StorageNotConnected,
  Unauthorized,
  Validation
} from "../errors"
import { OrgPath } from "../http/paths"
import {
  FeedbackAttachment,
  FeedbackIntakePayload,
  FeedbackStatus,
  FeedbackUploadPayload,
  SubmitFeedbackInput
} from "./Feedback"

export const FeedbackGroup = HttpApiGroup.make("feedback")
  .add(
    HttpApiEndpoint.get("status", "/orgs/:orgSlug/feedback", {
      params: OrgPath,
      success: FeedbackStatus,
      error: [Unauthorized, NotFound, Forbidden]
    }).annotate(RequiresOrg, "membership")
  )
  .add(
    HttpApiEndpoint.post("upload", "/orgs/:orgSlug/feedback/attachments", {
      params: OrgPath,
      payload: FeedbackUploadPayload,
      success: FeedbackAttachment,
      error: [
        Unauthorized,
        NotFound,
        Forbidden,
        AttachmentTooLarge,
        AttachmentTypeRejected,
        StorageNotConnected,
        StorageConfigMissing,
        StorageError,
        Validation
      ]
    }).annotate(RequiresOrg, "membership")
  )
  .add(
    HttpApiEndpoint.post("submit", "/orgs/:orgSlug/feedback", {
      params: OrgPath,
      payload: SubmitFeedbackInput,
      success: HttpApiSchema.NoContent,
      error: [Unauthorized, NotFound, Forbidden, Validation]
    }).annotate(RequiresOrg, "membership")
  )
  .middleware(OrgAccess)
  .middleware(Authentication)

export class FeedbackIntakeGuard extends HttpApiMiddleware.Service<FeedbackIntakeGuard>()(
  "@pp/shared/feedback/FeedbackApi/FeedbackIntakeGuard",
  { error: [NotFound, RateLimited] }
) {}

export const FeedbackIntakeGroup = HttpApiGroup.make("feedbackIntake")
  .add(
    HttpApiEndpoint.post("receive", "/feedback/intake", {
      payload: FeedbackIntakePayload,
      success: HttpApiSchema.NoContent,
      error: [NotFound, RateLimited, Conflict]
    })
  )
  .middleware(FeedbackIntakeGuard)
