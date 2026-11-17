import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import * as Schema from "effect/Schema"

import { OrgAccess, RequiresOrg } from "../access/OrgAccess"
import { Authentication } from "../auth/Authentication"
import {
  Conflict,
  Forbidden,
  ImportFormatUnsupported,
  NotFound,
  StorageError,
  StorageNotConnected,
  Unauthorized,
  Validation
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
        Unauthorized,
        NotFound,
        Forbidden,
        Validation,
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
      success: ProjectImport,
      error: [Unauthorized, NotFound, Forbidden]
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
          Unauthorized,
          NotFound,
          Forbidden,
          Conflict,
          Validation,
          StorageNotConnected,
          StorageError
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
        error: [Unauthorized, NotFound, Forbidden, Conflict]
      }
    )
      .annotate(RequiresOrg, { project: ["create"] })
      .middleware(OrgAccess)
  )
  .middleware(Authentication)
