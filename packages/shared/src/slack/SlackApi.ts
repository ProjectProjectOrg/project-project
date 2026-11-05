import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import * as Schema from "effect/Schema"

import { OrgAccess, RequiresOrg } from "../access/OrgAccess"
import { ProjectAccess, RequiresProject } from "../access/ProjectAccess"
import { Authentication } from "../auth/Authentication"
import { Conflict, Forbidden, NotFound, Unauthorized } from "../errors"
import { OrgPath, ProjectPath } from "../http/paths"
import {
  ConnectSlackInput,
  SaveSlackProjectInput,
  SlackAuthInvalid,
  SlackChannel,
  SlackError,
  SlackNotConnected,
  SlackOrgStatus,
  SlackProfile,
  SlackProjectStatus,
  SlackRateLimited
} from "./Slack"

const SlackErrors = [
  Unauthorized,
  NotFound,
  Forbidden,
  SlackNotConnected,
  SlackAuthInvalid,
  SlackRateLimited,
  SlackError,
  Conflict
] as const

export const SlackGroup = HttpApiGroup.make("slack")
  .add(
    HttpApiEndpoint.get("orgStatus", "/orgs/:orgSlug/integrations/slack", {
      params: OrgPath,
      success: SlackOrgStatus,
      error: SlackErrors
    })
      .annotate(RequiresOrg, { integration: ["manage"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.put("connectOrg", "/orgs/:orgSlug/integrations/slack", {
      params: OrgPath,
      payload: ConnectSlackInput,
      success: SlackOrgStatus,
      error: SlackErrors
    })
      .annotate(RequiresOrg, { integration: ["manage"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.delete(
      "disconnectOrg",
      "/orgs/:orgSlug/integrations/slack",
      { params: OrgPath, success: SlackOrgStatus, error: SlackErrors }
    )
      .annotate(RequiresOrg, { integration: ["manage"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.get(
      "manifest",
      "/orgs/:orgSlug/integrations/slack/manifest",
      {
        params: OrgPath,
        success: Schema.Struct({
          manifest: Schema.String,
          createUrl: Schema.String,
          redirectUri: Schema.String
        }),
        error: SlackErrors
      }
    )
      .annotate(RequiresOrg, { integration: ["manage"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.get(
      "channels",
      "/orgs/:orgSlug/projects/:slug/integrations/slack/channels",
      {
        params: ProjectPath,
        success: Schema.Array(SlackChannel),
        error: SlackErrors
      }
    )
      .annotate(RequiresProject, { settings: ["manage"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.get(
      "projectStatus",
      "/orgs/:orgSlug/projects/:slug/integrations/slack",
      { params: ProjectPath, success: SlackProjectStatus, error: SlackErrors }
    )
      .annotate(RequiresProject, { ticket: ["read"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.put(
      "saveProject",
      "/orgs/:orgSlug/projects/:slug/integrations/slack",
      {
        params: ProjectPath,
        payload: SaveSlackProjectInput,
        success: SlackProjectStatus,
        error: SlackErrors
      }
    )
      .annotate(RequiresProject, { settings: ["manage"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.delete(
      "disconnectProject",
      "/orgs/:orgSlug/projects/:slug/integrations/slack",
      { params: ProjectPath, success: SlackProjectStatus, error: SlackErrors }
    )
      .annotate(RequiresProject, { settings: ["manage"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "testProject",
      "/orgs/:orgSlug/projects/:slug/integrations/slack/test",
      {
        params: ProjectPath,
        success: HttpApiSchema.NoContent,
        error: SlackErrors
      }
    )
      .annotate(RequiresProject, { settings: ["manage"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.get("profiles", "/integrations/slack/profiles", {
      success: Schema.Array(SlackProfile),
      error: SlackErrors
    })
  )
  .add(
    HttpApiEndpoint.delete(
      "disconnectProfile",
      "/orgs/:orgSlug/integrations/slack/profile",
      { params: OrgPath, success: HttpApiSchema.NoContent, error: SlackErrors }
    )
      .annotate(RequiresOrg, "membership")
      .middleware(OrgAccess)
  )
  .middleware(Authentication)
