import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import * as Schema from "effect/Schema"

import { OrgAccess, RequiresOrg } from "../access/OrgAccess"
import { ProjectAccess, RequiresProject } from "../access/ProjectAccess"
import { Authentication } from "../auth/Authentication"
import {
  EverhourApiKeyMissing,
  EverhourAuthInvalid,
  EverhourConfigMissing,
  EverhourError,
  EverhourProjectAccessDenied,
  EverhourRateLimited,
  Forbidden,
  NotFound,
  Unauthorized
} from "../errors"
import { GroupPath, OrgPath, ProjectPath, TicketPath } from "../http/paths"
import {
  ConnectEverhourProfileInput,
  EverhourProjectIntegrationStatus,
  EverhourSyncSummary,
  PersonalEverhour
} from "./Everhour"
import {
  ActiveTimer,
  LogTimeInput,
  StartSprintTimerInput,
  SprintTimeSummary,
  StartTimerInput,
  TicketTimeSummary,
  WorkTypeOption
} from "./TimeTracking"

export const EverhourGroup = HttpApiGroup.make("everhour")
  .add(
    HttpApiEndpoint.get("profile", "/integrations/everhour/profile", {
      success: PersonalEverhour,
      error: Unauthorized
    })
  )
  .add(
    HttpApiEndpoint.put("connectProfile", "/integrations/everhour/profile", {
      payload: ConnectEverhourProfileInput,
      success: PersonalEverhour,
      error: [
        Unauthorized,
        EverhourAuthInvalid,
        EverhourRateLimited,
        EverhourConfigMissing,
        EverhourError
      ]
    })
  )
  .add(
    HttpApiEndpoint.delete(
      "disconnectProfile",
      "/integrations/everhour/profile",
      {
        success: PersonalEverhour,
        error: Unauthorized
      }
    )
  )
  .add(
    HttpApiEndpoint.get(
      "projectStatus",
      "/orgs/:orgSlug/projects/:slug/integrations/everhour",
      {
        params: ProjectPath,
        success: EverhourProjectIntegrationStatus,
        error: [Unauthorized, NotFound, Forbidden]
      }
    )
      .annotate(RequiresProject, { time: ["read"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "connectProject",
      "/orgs/:orgSlug/projects/:slug/integrations/everhour/connect",
      {
        params: ProjectPath,
        success: EverhourSyncSummary,
        error: [
          Unauthorized,
          NotFound,
          Forbidden,
          EverhourApiKeyMissing,
          EverhourAuthInvalid,
          EverhourRateLimited,
          EverhourConfigMissing,
          EverhourError
        ]
      }
    )
      .annotate(RequiresProject, { settings: ["manage"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "syncProject",
      "/orgs/:orgSlug/projects/:slug/integrations/everhour/sync",
      {
        params: ProjectPath,
        success: EverhourSyncSummary,
        error: [
          Unauthorized,
          NotFound,
          Forbidden,
          EverhourApiKeyMissing,
          EverhourAuthInvalid,
          EverhourRateLimited,
          EverhourConfigMissing,
          EverhourError
        ]
      }
    )
      .annotate(RequiresProject, { settings: ["manage"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.delete(
      "disconnectProject",
      "/orgs/:orgSlug/projects/:slug/integrations/everhour",
      {
        params: ProjectPath,
        success: EverhourProjectIntegrationStatus,
        error: [Unauthorized, NotFound, Forbidden]
      }
    )
      .annotate(RequiresProject, { settings: ["manage"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.get(
      "ticketWorkTypes",
      "/orgs/:orgSlug/projects/:slug/tickets/:id/everhour/work-types",
      {
        params: TicketPath,
        success: Schema.Array(WorkTypeOption),
        error: [Unauthorized, NotFound, Forbidden]
      }
    )
      .annotate(RequiresProject, { time: ["log"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "startTicketTimer",
      "/orgs/:orgSlug/projects/:slug/tickets/:id/everhour/timer/start",
      {
        params: TicketPath,
        payload: StartTimerInput,
        success: ActiveTimer,
        error: [
          Unauthorized,
          NotFound,
          Forbidden,
          EverhourApiKeyMissing,
          EverhourAuthInvalid,
          EverhourProjectAccessDenied,
          EverhourRateLimited,
          EverhourConfigMissing,
          EverhourError
        ]
      }
    )
      .annotate(RequiresProject, { time: ["log"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "startSprintTimer",
      "/orgs/:orgSlug/projects/:slug/groups/:id/everhour/timer/start",
      {
        params: GroupPath,
        payload: StartSprintTimerInput,
        success: ActiveTimer,
        error: [
          Unauthorized,
          NotFound,
          Forbidden,
          EverhourApiKeyMissing,
          EverhourAuthInvalid,
          EverhourProjectAccessDenied,
          EverhourRateLimited,
          EverhourConfigMissing,
          EverhourError
        ]
      }
    )
      .annotate(RequiresProject, { time: ["log"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.post("stopTimer", "/orgs/:orgSlug/everhour/timer/stop", {
      params: OrgPath,
      success: Schema.NullOr(ActiveTimer),
      error: [
        Unauthorized,
        NotFound,
        EverhourApiKeyMissing,
        EverhourAuthInvalid,
        EverhourRateLimited,
        EverhourConfigMissing,
        EverhourError
      ]
    })
      .annotate(RequiresOrg, "membership")
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.get(
      "currentTimer",
      "/orgs/:orgSlug/everhour/timer/current",
      {
        params: OrgPath,
        success: Schema.NullOr(ActiveTimer),
        error: [
          Unauthorized,
          NotFound,
          EverhourApiKeyMissing,
          EverhourAuthInvalid,
          EverhourRateLimited,
          EverhourConfigMissing,
          EverhourError
        ]
      }
    )
      .annotate(RequiresOrg, "membership")
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "logTime",
      "/orgs/:orgSlug/projects/:slug/everhour/time",
      {
        params: ProjectPath,
        payload: LogTimeInput,
        success: Schema.NullOr(TicketTimeSummary),
        error: [
          Unauthorized,
          NotFound,
          Forbidden,
          EverhourApiKeyMissing,
          EverhourAuthInvalid,
          EverhourProjectAccessDenied,
          EverhourRateLimited,
          EverhourConfigMissing,
          EverhourError
        ]
      }
    )
      .annotate(RequiresProject, { time: ["log"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.get(
      "ticketTime",
      "/orgs/:orgSlug/projects/:slug/tickets/:id/everhour/time",
      {
        params: TicketPath,
        success: TicketTimeSummary,
        error: [Unauthorized, NotFound, Forbidden]
      }
    )
      .annotate(RequiresProject, { time: ["read"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.get(
      "sprintTime",
      "/orgs/:orgSlug/projects/:slug/groups/:id/everhour/time",
      {
        params: GroupPath,
        success: Schema.NullOr(SprintTimeSummary),
        error: [Unauthorized, NotFound, Forbidden]
      }
    )
      .annotate(RequiresProject, { time: ["read"] })
      .middleware(ProjectAccess)
  )
  .middleware(Authentication)
