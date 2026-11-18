import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"

import { ProjectAccess, RequiresProject } from "../access/ProjectAccess"
import { Authentication } from "../auth/Authentication"
import { TicketPath } from "../http/paths"

export const InboxGroup = HttpApiGroup.make("inbox")
  .add(
    HttpApiEndpoint.put(
      "markRead",
      "/orgs/:orgSlug/projects/:slug/tickets/:id/read",
      {
        params: TicketPath,
        success: HttpApiSchema.NoContent
      }
    ).annotate(RequiresProject, { ticket: ["read"] })
  )
  .middleware(ProjectAccess)
  .middleware(Authentication)
