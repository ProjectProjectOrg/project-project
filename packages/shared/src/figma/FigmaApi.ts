import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import * as Schema from "effect/Schema"

import { ProjectAccess, RequiresProject } from "../access/ProjectAccess"
import { Authentication } from "../auth/Authentication"
import {
  FigmaAuthInvalid,
  FigmaError,
  FigmaNotConnected,
  FigmaRateLimited,
  StorageNotConnected
} from "../errors"
import { ProjectPath, TicketPath } from "../http/paths"
import {
  ConnectFigmaProjectInput,
  FigmaLinkMetadata,
  FigmaProjectIntegrationStatus,
  PersonalFigma
} from "./Figma"

export const FigmaGroup = HttpApiGroup.make("figma")
  .add(
    HttpApiEndpoint.get("profile", "/integrations/figma/profile", {
      success: PersonalFigma
    })
  )
  .add(
    HttpApiEndpoint.delete("disconnectProfile", "/integrations/figma/profile", {
      success: PersonalFigma
    })
  )
  .add(
    HttpApiEndpoint.get(
      "projectStatus",
      "/orgs/:orgSlug/projects/:slug/integrations/figma",
      {
        params: ProjectPath,
        success: FigmaProjectIntegrationStatus
      }
    )
      .annotate(RequiresProject, { figma: ["read"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "connectProject",
      "/orgs/:orgSlug/projects/:slug/integrations/figma/connect",
      {
        params: ProjectPath,
        payload: ConnectFigmaProjectInput,
        success: FigmaProjectIntegrationStatus,
        error: [
          StorageNotConnected,
          FigmaNotConnected,
          FigmaAuthInvalid,
          FigmaRateLimited,
          FigmaError
        ]
      }
    )
      .annotate(RequiresProject, { settings: ["manage"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.delete(
      "disconnectProject",
      "/orgs/:orgSlug/projects/:slug/integrations/figma",
      {
        params: ProjectPath,
        success: FigmaProjectIntegrationStatus
      }
    )
      .annotate(RequiresProject, { settings: ["manage"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.get(
      "ticketLinks",
      "/orgs/:orgSlug/projects/:slug/tickets/:id/figma/links",
      {
        params: TicketPath,
        success: Schema.Array(FigmaLinkMetadata)
      }
    )
      .annotate(RequiresProject, { figma: ["read"] })
      .middleware(ProjectAccess)
  )
  .middleware(Authentication)
