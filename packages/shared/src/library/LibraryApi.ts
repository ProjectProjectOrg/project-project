import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import * as Schema from "effect/Schema"

import { OrgAccess, RequiresOrg } from "../access/OrgAccess"
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
import { OrgPath, ProjectPath } from "../http/paths"
import { Slug } from "../projects/Project"
import {
  BlockDefinition,
  BlockKey,
  CreateBlockInput,
  CreateTypeInput,
  Library,
  TypeDefinition,
  TypeKey,
  UpdateBlockInput,
  UpdateTypeInput
} from "./Library"

const OrgBlockPath = Schema.Struct({ orgSlug: Slug, key: BlockKey })

const OrgTypePath = Schema.Struct({ orgSlug: Slug, key: TypeKey })

const ProjectBlockPath = Schema.Struct({
  orgSlug: Slug,
  slug: Slug,
  key: BlockKey
})

const ProjectTypePath = Schema.Struct({
  orgSlug: Slug,
  slug: Slug,
  key: TypeKey
})

export const LibraryGroup = HttpApiGroup.make("library")
  .add(
    HttpApiEndpoint.get("org", "/orgs/:orgSlug/library", {
      params: OrgPath,
      success: Library,
      error: [Unauthorized, NotFound, Forbidden]
    })
      .annotate(RequiresOrg, "membership")
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.get("project", "/orgs/:orgSlug/projects/:slug/library", {
      params: ProjectPath,
      success: Library,
      error: [Unauthorized, NotFound, Forbidden]
    })
      .annotate(RequiresProject, { ticket: ["read"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.post("createOrgBlock", "/orgs/:orgSlug/library/blocks", {
      params: OrgPath,
      payload: CreateBlockInput,
      success: BlockDefinition,
      error: [
        Unauthorized,
        NotFound,
        Forbidden,
        Conflict,
        Validation,
        MentionInvalid
      ]
    })
      .annotate(RequiresOrg, { library: ["manage"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.patch(
      "updateOrgBlock",
      "/orgs/:orgSlug/library/blocks/:key",
      {
        params: OrgBlockPath,
        payload: UpdateBlockInput,
        success: BlockDefinition,
        error: [Unauthorized, NotFound, Forbidden, Validation, MentionInvalid]
      }
    )
      .annotate(RequiresOrg, { library: ["manage"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.delete(
      "removeOrgBlock",
      "/orgs/:orgSlug/library/blocks/:key",
      {
        params: OrgBlockPath,
        success: HttpApiSchema.NoContent,
        error: [Unauthorized, NotFound, Forbidden]
      }
    )
      .annotate(RequiresOrg, { library: ["manage"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.post("createOrgType", "/orgs/:orgSlug/library/types", {
      params: OrgPath,
      payload: CreateTypeInput,
      success: TypeDefinition,
      error: [
        Unauthorized,
        NotFound,
        Forbidden,
        Conflict,
        Validation,
        MentionInvalid
      ]
    })
      .annotate(RequiresOrg, { library: ["manage"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.patch(
      "updateOrgType",
      "/orgs/:orgSlug/library/types/:key",
      {
        params: OrgTypePath,
        payload: UpdateTypeInput,
        success: TypeDefinition,
        error: [Unauthorized, NotFound, Forbidden, Validation, MentionInvalid]
      }
    )
      .annotate(RequiresOrg, { library: ["manage"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.delete(
      "removeOrgType",
      "/orgs/:orgSlug/library/types/:key",
      {
        params: OrgTypePath,
        success: HttpApiSchema.NoContent,
        error: [Unauthorized, NotFound, Forbidden]
      }
    )
      .annotate(RequiresOrg, { library: ["manage"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "createProjectBlock",
      "/orgs/:orgSlug/projects/:slug/library/blocks",
      {
        params: ProjectPath,
        payload: CreateBlockInput,
        success: BlockDefinition,
        error: [
          Unauthorized,
          NotFound,
          Forbidden,
          Conflict,
          Validation,
          MentionInvalid
        ]
      }
    )
      .annotate(RequiresProject, { library: ["manage"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.patch(
      "updateProjectBlock",
      "/orgs/:orgSlug/projects/:slug/library/blocks/:key",
      {
        params: ProjectBlockPath,
        payload: UpdateBlockInput,
        success: BlockDefinition,
        error: [Unauthorized, NotFound, Forbidden, Validation, MentionInvalid]
      }
    )
      .annotate(RequiresProject, { library: ["manage"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.delete(
      "removeProjectBlock",
      "/orgs/:orgSlug/projects/:slug/library/blocks/:key",
      {
        params: ProjectBlockPath,
        success: HttpApiSchema.NoContent,
        error: [Unauthorized, NotFound, Forbidden]
      }
    )
      .annotate(RequiresProject, { library: ["manage"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "hideProjectBlock",
      "/orgs/:orgSlug/projects/:slug/library/blocks/:key/hide",
      {
        params: ProjectBlockPath,
        success: HttpApiSchema.NoContent,
        error: [Unauthorized, NotFound, Forbidden, Conflict]
      }
    )
      .annotate(RequiresProject, { library: ["manage"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "createProjectType",
      "/orgs/:orgSlug/projects/:slug/library/types",
      {
        params: ProjectPath,
        payload: CreateTypeInput,
        success: TypeDefinition,
        error: [
          Unauthorized,
          NotFound,
          Forbidden,
          Conflict,
          Validation,
          MentionInvalid
        ]
      }
    )
      .annotate(RequiresProject, { library: ["manage"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.patch(
      "updateProjectType",
      "/orgs/:orgSlug/projects/:slug/library/types/:key",
      {
        params: ProjectTypePath,
        payload: UpdateTypeInput,
        success: TypeDefinition,
        error: [Unauthorized, NotFound, Forbidden, Validation, MentionInvalid]
      }
    )
      .annotate(RequiresProject, { library: ["manage"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.delete(
      "removeProjectType",
      "/orgs/:orgSlug/projects/:slug/library/types/:key",
      {
        params: ProjectTypePath,
        success: HttpApiSchema.NoContent,
        error: [Unauthorized, NotFound, Forbidden]
      }
    )
      .annotate(RequiresProject, { library: ["manage"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "hideProjectType",
      "/orgs/:orgSlug/projects/:slug/library/types/:key/hide",
      {
        params: ProjectTypePath,
        success: HttpApiSchema.NoContent,
        error: [Unauthorized, NotFound, Forbidden, Conflict]
      }
    )
      .annotate(RequiresProject, { library: ["manage"] })
      .middleware(ProjectAccess)
  )
  .middleware(Authentication)
