import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import * as Schema from "effect/Schema"

import { ProjectAccess, RequiresProject } from "../access/ProjectAccess"
import { Authentication } from "../auth/Authentication"
import { Conflict, Forbidden, NotFound, Unauthorized } from "../errors"
import { ProjectPath } from "../http/paths"
import {
  CreateStatusInput,
  ProjectStatus,
  ReorderStatusInput,
  StatusSlug,
  UpdateStatusInput
} from "./Status"

const ProjectStatusPath = Schema.Struct({
  ...ProjectPath.fields,
  statusSlug: StatusSlug
})

export const StatusesGroup = HttpApiGroup.make("statuses")
  .add(
    HttpApiEndpoint.get("list", "/orgs/:orgSlug/projects/:slug/statuses", {
      params: ProjectPath,
      success: Schema.Array(ProjectStatus),
      error: [Unauthorized, NotFound, Forbidden]
    }).annotate(RequiresProject, { ticket: ["read"] })
  )
  .add(
    HttpApiEndpoint.post("create", "/orgs/:orgSlug/projects/:slug/statuses", {
      params: ProjectPath,
      payload: CreateStatusInput,
      success: ProjectStatus,
      error: [Unauthorized, NotFound, Forbidden, Conflict]
    }).annotate(RequiresProject, { workflow: ["manage"] })
  )
  .add(
    HttpApiEndpoint.patch(
      "update",
      "/orgs/:orgSlug/projects/:slug/statuses/:statusSlug",
      {
        params: ProjectStatusPath,
        payload: UpdateStatusInput,
        success: ProjectStatus,
        error: [Unauthorized, NotFound, Forbidden, Conflict]
      }
    ).annotate(RequiresProject, { workflow: ["manage"] })
  )
  .add(
    HttpApiEndpoint.patch(
      "reorder",
      "/orgs/:orgSlug/projects/:slug/statuses/:statusSlug/order",
      {
        params: ProjectStatusPath,
        payload: ReorderStatusInput,
        success: ProjectStatus,
        error: [Unauthorized, NotFound, Forbidden, Conflict]
      }
    ).annotate(RequiresProject, { workflow: ["manage"] })
  )
  .add(
    HttpApiEndpoint.delete(
      "remove",
      "/orgs/:orgSlug/projects/:slug/statuses/:statusSlug",
      {
        params: ProjectStatusPath,
        query: Schema.Struct({ reassignTo: Schema.optional(StatusSlug) }),
        success: HttpApiSchema.NoContent,
        error: [Unauthorized, NotFound, Forbidden, Conflict]
      }
    ).annotate(RequiresProject, { workflow: ["manage"] })
  )
  .middleware(ProjectAccess)
  .middleware(Authentication)
