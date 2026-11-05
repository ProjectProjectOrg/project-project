import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import * as Schema from "effect/Schema"

import { ProjectAccess, RequiresProject } from "../access/ProjectAccess"
import { Authentication } from "../auth/Authentication"
import { Conflict, Forbidden, NotFound, Unauthorized } from "../errors"
import { ProjectPath } from "../http/paths"
import { Slug } from "../projects/Project"
import { CreateTagInput, Tag, TagName, UpdateTagInput } from "./Tag"

const ProjectTagPath = Schema.Struct({
  orgSlug: Slug,
  slug: Slug,
  name: TagName
})

const TagUsageCounts = Schema.Record(TagName, Schema.Finite)

export type TagUsageCounts = typeof TagUsageCounts.Type

export const TagsGroup = HttpApiGroup.make("tags")
  .add(
    HttpApiEndpoint.get("list", "/orgs/:orgSlug/projects/:slug/tags", {
      params: ProjectPath,
      success: Schema.Array(Tag),
      error: [Unauthorized, NotFound, Forbidden]
    }).annotate(RequiresProject, { ticket: ["read"] })
  )
  .add(
    HttpApiEndpoint.get(
      "usageCounts",
      "/orgs/:orgSlug/projects/:slug/tags/usage-counts",
      {
        params: ProjectPath,
        success: TagUsageCounts,
        error: [Unauthorized, NotFound, Forbidden]
      }
    ).annotate(RequiresProject, { ticket: ["read"] })
  )
  .add(
    HttpApiEndpoint.post("create", "/orgs/:orgSlug/projects/:slug/tags", {
      params: ProjectPath,
      payload: CreateTagInput,
      success: Tag,
      error: [Unauthorized, NotFound, Forbidden, Conflict]
    }).annotate(RequiresProject, { workflow: ["manage"] })
  )
  .add(
    HttpApiEndpoint.patch(
      "update",
      "/orgs/:orgSlug/projects/:slug/tags/:name",
      {
        params: ProjectTagPath,
        payload: UpdateTagInput,
        success: Tag,
        error: [Unauthorized, NotFound, Forbidden, Conflict]
      }
    ).annotate(RequiresProject, { workflow: ["manage"] })
  )
  .add(
    HttpApiEndpoint.delete(
      "delete",
      "/orgs/:orgSlug/projects/:slug/tags/:name",
      {
        params: ProjectTagPath,
        success: HttpApiSchema.NoContent,
        error: [Unauthorized, NotFound, Forbidden]
      }
    ).annotate(RequiresProject, { workflow: ["manage"] })
  )
  .middleware(ProjectAccess)
  .middleware(Authentication)
