import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import * as Schema from "effect/Schema"

import { ProjectAccess, RequiresProject } from "../access/ProjectAccess"
import { Authentication } from "../auth/Authentication"
import {
  FigmaAuthInvalid,
  FigmaError,
  FigmaNotConnected,
  FigmaRateLimited,
  Forbidden,
  NotFound,
  StorageNotConnected,
  Unauthorized
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
      success: PersonalFigma,
      error: [Unauthorized]
    })
  )
  .add(
    HttpApiEndpoint.delete("disconnectProfile", "/integrations/figma/profile", {
      success: PersonalFigma,
      error: [Unauthorized]
    })
  )
  .add(
    HttpApiEndpoint.get(
      "projectStatus",
      "/orgs/:orgSlug/projects/:slug/integrations/figma",
      {
        params: ProjectPath,
        success: FigmaProjectIntegrationStatus,
        error: [Unauthorized, NotFound, Forbidden]
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
          Unauthorized,
          NotFound,
          Forbidden,
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
        success: FigmaProjectIntegrationStatus,
        error: [Unauthorized, NotFound, Forbidden]
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
        success: Schema.Array(FigmaLinkMetadata),
        error: [Unauthorized, NotFound, Forbidden]
      }
    )
      .annotate(RequiresProject, { figma: ["read"] })
      .middleware(ProjectAccess)
  )
  .middleware(Authentication)
