import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"

import { ProjectAccess, RequiresProject } from "../access/ProjectAccess"
import { Authentication } from "../auth/Authentication"
import { Conflict, Forbidden, NotFound, Unauthorized } from "../errors"
import { ProjectPath } from "../http/paths"
import { GitAutomation, UpdateGitAutomationInput } from "./GitAutomation"

export const GitAutomationGroup = HttpApiGroup.make("gitAutomation")
  .add(
    HttpApiEndpoint.get("get", "/orgs/:orgSlug/projects/:slug/git-automation", {
      params: ProjectPath,
      success: GitAutomation,
      error: [Unauthorized, NotFound, Forbidden]
    }).annotate(RequiresProject, { github: ["read"] })
  )
  .add(
    HttpApiEndpoint.patch(
      "update",
      "/orgs/:orgSlug/projects/:slug/git-automation",
      {
        params: ProjectPath,
        payload: UpdateGitAutomationInput,
        success: GitAutomation,
        error: [Unauthorized, NotFound, Forbidden, Conflict]
      }
    ).annotate(RequiresProject, { workflow: ["manage"] })
  )
  .middleware(ProjectAccess)
  .middleware(Authentication)
