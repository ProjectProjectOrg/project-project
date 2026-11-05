import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import * as Schema from "effect/Schema"

import { OrgAccess, RequiresOrg } from "../access/OrgAccess"
import { ProjectAccess, RequiresProject } from "../access/ProjectAccess"
import { Authentication } from "../auth/Authentication"
import {
  AttachmentNotUploaded,
  AttachmentTooLarge,
  AttachmentTypeRejected,
  Forbidden,
  NotFound,
  StorageConfigMissing,
  StorageError,
  StorageNotConnected,
  Unauthorized
} from "../errors"
import { OrgPath, ProjectPath, TicketPath } from "../http/paths"
import { Slug } from "../projects/Project"
import { TicketId } from "../tickets/Ticket"
import {
  Attachment,
  AttachmentListPage,
  AttachmentListParams,
  AttachmentSummary,
  PrepareAttachmentInput,
  PrepareAttachmentResult
} from "./Attachment"

const AttachmentPath = Schema.Struct({
  orgSlug: Slug,
  slug: Slug,
  id: TicketId,
  attachmentId: Schema.String
})

const OrgAttachmentPath = Schema.Struct({
  orgSlug: Slug,
  attachmentId: Schema.String
})

export const AttachmentsGroup = HttpApiGroup.make("attachments")
  .add(
    HttpApiEndpoint.post(
      "prepare",
      "/orgs/:orgSlug/projects/:slug/tickets/:id/attachments/prepare",
      {
        params: TicketPath,
        payload: PrepareAttachmentInput,
        success: PrepareAttachmentResult,
        error: [
          Unauthorized,
          NotFound,
          Forbidden,
          AttachmentTooLarge,
          AttachmentTypeRejected,
          StorageNotConnected,
          StorageConfigMissing,
          StorageError
        ]
      }
    )
      .annotate(RequiresProject, { attachment: ["upload"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "commit",
      "/orgs/:orgSlug/projects/:slug/tickets/:id/attachments/:attachmentId/commit",
      {
        params: AttachmentPath,
        success: Attachment,
        error: [
          Unauthorized,
          NotFound,
          Forbidden,
          AttachmentNotUploaded,
          AttachmentTooLarge,
          AttachmentTypeRejected,
          StorageNotConnected,
          StorageConfigMissing,
          StorageError
        ]
      }
    )
      .annotate(RequiresProject, { attachment: ["upload"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "prepareProject",
      "/orgs/:orgSlug/projects/:slug/attachments/prepare",
      {
        params: ProjectPath,
        payload: PrepareAttachmentInput,
        success: PrepareAttachmentResult,
        error: [
          Unauthorized,
          NotFound,
          Forbidden,
          AttachmentTooLarge,
          AttachmentTypeRejected,
          StorageNotConnected,
          StorageConfigMissing,
          StorageError
        ]
      }
    )
      .annotate(RequiresProject, { settings: ["manage"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "commitProject",
      "/orgs/:orgSlug/projects/:slug/attachments/:attachmentId/commit",
      {
        params: Schema.Struct({
          ...ProjectPath.fields,
          attachmentId: Schema.String
        }),
        success: Attachment,
        error: [
          Unauthorized,
          NotFound,
          Forbidden,
          AttachmentNotUploaded,
          AttachmentTooLarge,
          AttachmentTypeRejected,
          StorageNotConnected,
          StorageConfigMissing,
          StorageError
        ]
      }
    )
      .annotate(RequiresProject, { settings: ["manage"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.get("list", "/orgs/:orgSlug/attachments", {
      params: OrgPath,
      query: AttachmentListParams,
      success: AttachmentListPage,
      error: [Unauthorized, NotFound, Forbidden]
    })
      .annotate(RequiresOrg, { storage: ["manage"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.get("summary", "/orgs/:orgSlug/attachments/summary", {
      params: OrgPath,
      success: AttachmentSummary,
      error: [Unauthorized, NotFound, Forbidden]
    })
      .annotate(RequiresOrg, { storage: ["manage"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.delete(
      "remove",
      "/orgs/:orgSlug/attachments/:attachmentId",
      {
        params: OrgAttachmentPath,
        success: HttpApiSchema.NoContent,
        error: [
          Unauthorized,
          NotFound,
          Forbidden,
          StorageNotConnected,
          StorageConfigMissing,
          StorageError
        ]
      }
    )
      .annotate(RequiresOrg, { storage: ["manage"] })
      .middleware(OrgAccess)
  )
  .middleware(Authentication)
