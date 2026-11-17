import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"

import { ProjectAccess, RequiresProject } from "../access/ProjectAccess"
import { Authentication } from "../auth/Authentication"
import {
  Conflict,
  Forbidden,
  MentionInvalid,
  NotFound,
  Unauthorized,
  Validation
} from "../errors"
import { ProjectPath } from "../http/paths"
import { FixReferenceInput, ReferencesToFix } from "./ProjectReferences"

export const ProjectReferencesGroup = HttpApiGroup.make("projectReferences")
  .add(
    HttpApiEndpoint.get("list", "/orgs/:orgSlug/projects/:slug/references", {
      params: ProjectPath,
      success: ReferencesToFix,
      error: [Unauthorized, NotFound, Forbidden]
    })
      .annotate(RequiresProject, { settings: ["manage"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "fix",
      "/orgs/:orgSlug/projects/:slug/references/fix",
      {
        params: ProjectPath,
        payload: FixReferenceInput,
        success: ReferencesToFix,
        error: [
          Unauthorized,
          NotFound,
          Forbidden,
          Validation,
          MentionInvalid,
          Conflict
        ]
      }
    )
      .annotate(RequiresProject, { settings: ["manage"] })
      .middleware(ProjectAccess)
  )
  .middleware(Authentication)
