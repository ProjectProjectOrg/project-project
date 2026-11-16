import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"

import { ProjectAccess, RequiresProject } from "../access/ProjectAccess"
import { Authentication } from "../auth/Authentication"
import { Forbidden, NotFound, Unauthorized } from "../errors"
import { ProjectPath } from "../http/paths"
import { ProjectSync, ProjectSyncQuery } from "./ProjectSync"

export const SyncGroup = HttpApiGroup.make("sync")
  .add(
    HttpApiEndpoint.get("project", "/orgs/:orgSlug/projects/:slug/sync", {
      params: ProjectPath,
      query: ProjectSyncQuery,
      success: ProjectSync,
      error: [Unauthorized, NotFound, Forbidden]
    }).annotate(RequiresProject, { ticket: ["read"] })
  )
  .middleware(ProjectAccess)
  .middleware(Authentication)
