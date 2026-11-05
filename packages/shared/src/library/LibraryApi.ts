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
  CreateTemplateInput,
  Library,
  LibraryDefaults,
  TemplateDefinition,
  TemplateKey,
  UpdateBlockInput,
  UpdateTemplateDefaultsInput,
  UpdateTemplateInput
} from "./Library"

const OrgBlockPath = Schema.Struct({ orgSlug: Slug, key: BlockKey })

const OrgTemplatePath = Schema.Struct({ orgSlug: Slug, key: TemplateKey })

const ProjectBlockPath = Schema.Struct({
  orgSlug: Slug,
  slug: Slug,
  key: BlockKey
})

const ProjectTemplatePath = Schema.Struct({
  orgSlug: Slug,
  slug: Slug,
  key: TemplateKey
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
    HttpApiEndpoint.post(
      "createOrgTemplate",
      "/orgs/:orgSlug/library/templates",
      {
        params: OrgPath,
        payload: CreateTemplateInput,
        success: TemplateDefinition,
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
      .annotate(RequiresOrg, { library: ["manage"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.patch(
      "updateOrgTemplate",
      "/orgs/:orgSlug/library/templates/:key",
      {
        params: OrgTemplatePath,
        payload: UpdateTemplateInput,
        success: TemplateDefinition,
        error: [Unauthorized, NotFound, Forbidden, Validation, MentionInvalid]
      }
    )
      .annotate(RequiresOrg, { library: ["manage"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.delete(
      "removeOrgTemplate",
      "/orgs/:orgSlug/library/templates/:key",
      {
        params: OrgTemplatePath,
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
      "createProjectTemplate",
      "/orgs/:orgSlug/projects/:slug/library/templates",
      {
        params: ProjectPath,
        payload: CreateTemplateInput,
        success: TemplateDefinition,
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
      "updateProjectTemplate",
      "/orgs/:orgSlug/projects/:slug/library/templates/:key",
      {
        params: ProjectTemplatePath,
        payload: UpdateTemplateInput,
        success: TemplateDefinition,
        error: [Unauthorized, NotFound, Forbidden, Validation, MentionInvalid]
      }
    )
      .annotate(RequiresProject, { library: ["manage"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.delete(
      "removeProjectTemplate",
      "/orgs/:orgSlug/projects/:slug/library/templates/:key",
      {
        params: ProjectTemplatePath,
        success: HttpApiSchema.NoContent,
        error: [Unauthorized, NotFound, Forbidden]
      }
    )
      .annotate(RequiresProject, { library: ["manage"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "hideProjectTemplate",
      "/orgs/:orgSlug/projects/:slug/library/templates/:key/hide",
      {
        params: ProjectTemplatePath,
        success: HttpApiSchema.NoContent,
        error: [Unauthorized, NotFound, Forbidden, Conflict]
      }
    )
      .annotate(RequiresProject, { library: ["manage"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.patch(
      "setOrgTemplateDefaults",
      "/orgs/:orgSlug/library/defaults",
      {
        params: OrgPath,
        payload: UpdateTemplateDefaultsInput,
        success: LibraryDefaults,
        error: [Unauthorized, NotFound, Forbidden, Validation]
      }
    )
      .annotate(RequiresOrg, { library: ["manage"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.patch(
      "setTemplateDefaults",
      "/orgs/:orgSlug/projects/:slug/library/defaults",
      {
        params: ProjectPath,
        payload: UpdateTemplateDefaultsInput,
        success: LibraryDefaults,
        error: [Unauthorized, NotFound, Forbidden, Validation]
      }
    )
      .annotate(RequiresProject, { library: ["manage"] })
      .middleware(ProjectAccess)
  )
  .middleware(Authentication)
