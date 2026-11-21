import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import * as Schema from "effect/Schema"

import { OrgAccess, RequiresOrg } from "../access/OrgAccess"
import { Authentication } from "../auth/Authentication"
import {
  ImportFormatUnsupported,
  StorageError,
  StorageNotConnected,
  ProjectIdentifierTaken,
  ProjectImportInvalid,
  ProjectImportStateConflict
} from "../errors"
import { OrgPath } from "../http/paths"
import { Slug } from "./Project"
import { ProjectImport, RunProjectImportInput } from "./ProjectImport"

const ImportPath = Schema.Struct({ orgSlug: Slug, importId: Schema.String })

export const ProjectImportsGroup = HttpApiGroup.make("projectImports")
  .add(
    HttpApiEndpoint.post("upload", "/orgs/:orgSlug/project-imports", {
      params: OrgPath,
      success: ProjectImport,
      error: [
        ProjectImportInvalid,
        ImportFormatUnsupported,
        StorageNotConnected,
        StorageError
      ]
    })
      .annotate(RequiresOrg, { project: ["create"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.get("get", "/orgs/:orgSlug/project-imports/:importId", {
      params: ImportPath,
      success: ProjectImport
    })
      .annotate(RequiresOrg, { project: ["create"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "run",
      "/orgs/:orgSlug/project-imports/:importId/run",
      {
        params: ImportPath,
        payload: RunProjectImportInput,
        success: ProjectImport,
        error: [
          StorageNotConnected,
          StorageError,
          ProjectIdentifierTaken,
          ProjectImportInvalid,
          ProjectImportStateConflict
        ]
      }
    )
      .annotate(RequiresOrg, { project: ["create"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "cancel",
      "/orgs/:orgSlug/project-imports/:importId/cancel",
      {
        params: ImportPath,
        success: ProjectImport,
        error: [ProjectImportStateConflict]
      }
    )
      .annotate(RequiresOrg, { project: ["create"] })
      .middleware(OrgAccess)
  )
  .middleware(Authentication)
