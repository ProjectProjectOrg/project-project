import * as Schema from "effect/Schema"

import { CreatableProjectKey, Slug } from "./Project"
import { ExportedIntegration } from "./ProjectExport"

export const PROJECT_IMPORT_MAX_BYTES = 2 * 1024 * 1024 * 1024

export const ProjectImportStatus = Schema.Literals([
  "uploading",
  "ready",
  "importing",
  "failed",
  "cancelled",
  "succeeded"
])
export type ProjectImportStatus = typeof ProjectImportStatus.Type

export const ProjectImportPerson = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  image: Schema.NullOr(Schema.String),
  suggestedUserId: Schema.NullOr(Schema.String)
})
export type ProjectImportPerson = typeof ProjectImportPerson.Type

export const ProjectImport = Schema.Struct({
  id: Schema.String,
  status: ProjectImportStatus,
  source: Schema.NullOr(
    Schema.Struct({
      url: Schema.NullOr(Schema.String),
      name: Schema.String,
      key: Schema.String,
      slug: Schema.String
    })
  ),
  counts: Schema.Struct({
    tickets: Schema.Int,
    groups: Schema.Int,
    attachments: Schema.Int,
    missingAttachments: Schema.Int,
    activity: Schema.Int
  }),
  people: Schema.Array(ProjectImportPerson),
  types: Schema.Array(
    Schema.Struct({
      sourceKey: Schema.String,
      key: Schema.String,
      name: Schema.String
    })
  ),
  integrations: Schema.Array(ExportedIntegration),
  destination: Schema.NullOr(Schema.Struct({ slug: Schema.String })),
  failureReason: Schema.NullOr(Schema.String)
})
export type ProjectImport = typeof ProjectImport.Type

export const RunProjectImportInput = Schema.Struct({
  name: Schema.String.pipe(
    Schema.check(Schema.isMinLength(1)),
    Schema.check(Schema.isMaxLength(120))
  ),
  slug: Slug,
  key: CreatableProjectKey,
  people: Schema.Array(
    Schema.Struct({
      sourceUserId: Schema.String,
      userId: Schema.NullOr(Schema.String)
    })
  )
})
export type RunProjectImportInput = typeof RunProjectImportInput.Type
