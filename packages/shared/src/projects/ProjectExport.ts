import * as Schema from "effect/Schema"

import { CommentOrigin, ImportedSource } from "../comments/Comment"
import { EstimationMode } from "../estimates/Estimate"
import { GitAutomationEvent } from "../github/GitAutomation"
import { ActivityCause, TicketActivityChange } from "../tickets/TicketActivity"
import { ProjectBanner, ProjectIconImage, Role } from "./Project"

export const PROJECT_EXPORT_FORMAT_VERSION = 1

export const PROJECT_EXPORT_MANIFEST_PATH = "manifest.json"
export const PROJECT_EXPORT_MARKDOWN_DIR = "project"
export const PROJECT_EXPORT_ATTACHMENTS_DIR = "attachments"

export const ExportedIntegration = Schema.Literals([
  "github",
  "everhour",
  "figma",
  "slack"
])

export const ProjectExportManifest = Schema.Struct({
  formatVersion: Schema.Int,
  exportedAt: Schema.Date,
  source: Schema.Struct({
    url: Schema.NullOr(Schema.String),
    appVersion: Schema.NullOr(Schema.String)
  }),
  project: Schema.Struct({
    slug: Schema.String,
    key: Schema.String,
    name: Schema.String,
    icon: Schema.String,
    color: Schema.String,
    banner: Schema.NullOr(ProjectBanner),
    iconImage: Schema.NullOr(ProjectIconImage),
    estimation: EstimationMode,
    nextTicketNumber: Schema.Int,
    gitAutomationForwardOnly: Schema.Boolean,
    createdBy: Schema.String,
    createdAt: Schema.Date
  }),
  statuses: Schema.Array(
    Schema.Struct({
      slug: Schema.String,
      label: Schema.String,
      icon: Schema.String,
      color: Schema.String,
      orderKey: Schema.String,
      description: Schema.NullOr(Schema.String),
      createdBy: Schema.String,
      createdAt: Schema.Date
    })
  ),
  tags: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      color: Schema.String,
      createdBy: Schema.String,
      createdAt: Schema.Date
    })
  ),
  gitAutomation: Schema.Array(
    Schema.Struct({ event: GitAutomationEvent, statusSlug: Schema.String })
  ),
  members: Schema.Array(
    Schema.Struct({
      userId: Schema.String,
      role: Role,
      createdAt: Schema.Date
    })
  ),
  activity: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      ticketId: Schema.String,
      occurredAt: Schema.Date,
      actorKind: Schema.Literals(["user", "agent", "system", "imported"]),
      actorUserId: Schema.NullOr(Schema.String),
      actorClientId: Schema.NullOr(Schema.String),
      actorClientName: Schema.NullOr(Schema.String),
      actorSource: Schema.NullOr(
        Schema.Literals(["github", "automation", "import"])
      ),
      importedName: Schema.NullOr(Schema.String),
      importedSource: Schema.NullOr(ImportedSource),
      importedId: Schema.NullOr(Schema.String),
      cause: Schema.NullOr(ActivityCause),
      change: Schema.toEncoded(TicketActivityChange)
    })
  ),
  comments: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      ticketId: Schema.String,
      origin: CommentOrigin,
      authorKind: Schema.Literals(["user", "imported"]),
      authorId: Schema.NullOr(Schema.String),
      importedName: Schema.NullOr(Schema.String),
      importedSource: Schema.NullOr(ImportedSource),
      importedId: Schema.NullOr(Schema.String),
      createdAt: Schema.Date,
      editedAt: Schema.NullOr(Schema.Date)
    })
  ),
  attachments: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      filename: Schema.String,
      contentType: Schema.String,
      byteSize: Schema.Int,
      contentHash: Schema.NullOr(Schema.String),
      uploadedBy: Schema.String,
      createdAt: Schema.Date,
      references: Schema.Array(Schema.String),
      imageSlots: Schema.Array(Schema.String),
      missing: Schema.Boolean
    })
  ),
  people: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      email: Schema.String,
      username: Schema.NullOr(Schema.String),
      image: Schema.NullOr(Schema.String)
    })
  ),
  integrations: Schema.Array(ExportedIntegration)
})
export type ProjectExportManifest = typeof ProjectExportManifest.Type

export const ProjectExportManifestJson = Schema.toCodecJson(
  ProjectExportManifest
)
