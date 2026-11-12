import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import * as Schema from "effect/Schema"

import { ProjectAccess, RequiresProject } from "../access/ProjectAccess"
import { Authentication } from "../auth/Authentication"
import {
  Forbidden,
  NotFound,
  SprintCompletedImmutable,
  Unauthorized,
  Validation
} from "../errors"
import { GroupPath, ProjectPath } from "../http/paths"
import { Ticket } from "../tickets/Ticket"
import {
  CompleteSprintInput,
  CompleteSprintOutput,
  CreateGroupInput,
  Group,
  GroupDetail,
  UpdateGroupInput,
  UpdateGroupTicketsInput,
  UpdateGroupTicketsOutput
} from "./Group"

export const GroupsGroup = HttpApiGroup.make("groups")
  .add(
    HttpApiEndpoint.get("list", "/orgs/:orgSlug/projects/:slug/groups", {
      params: ProjectPath,
      success: Schema.Array(Group),
      error: [Unauthorized, NotFound, Forbidden]
    }).annotate(RequiresProject, { ticket: ["read"] })
  )
  .add(
    HttpApiEndpoint.post("create", "/orgs/:orgSlug/projects/:slug/groups", {
      params: ProjectPath,
      payload: CreateGroupInput,
      success: Group,
      error: [Unauthorized, NotFound, Forbidden, Validation]
    }).annotate(RequiresProject, "membership")
  )
  .add(
    HttpApiEndpoint.get("get", "/orgs/:orgSlug/projects/:slug/groups/:id", {
      params: GroupPath,
      success: GroupDetail,
      error: [Unauthorized, NotFound, Forbidden]
    }).annotate(RequiresProject, { ticket: ["read"] })
  )
  .add(
    HttpApiEndpoint.get(
      "listTickets",
      "/orgs/:orgSlug/projects/:slug/groups/:id/tickets",
      {
        params: GroupPath,
        success: Schema.Array(Ticket),
        error: [Unauthorized, NotFound, Forbidden]
      }
    ).annotate(RequiresProject, { ticket: ["read"] })
  )
  .add(
    HttpApiEndpoint.patch(
      "update",
      "/orgs/:orgSlug/projects/:slug/groups/:id",
      {
        params: GroupPath,
        payload: UpdateGroupInput,
        success: GroupDetail,
        error: [Unauthorized, NotFound, Forbidden, Validation]
      }
    ).annotate(RequiresProject, "membership")
  )
  .add(
    HttpApiEndpoint.patch(
      "updateTickets",
      "/orgs/:orgSlug/projects/:slug/groups/:id/tickets",
      {
        params: GroupPath,
        payload: UpdateGroupTicketsInput,
        success: UpdateGroupTicketsOutput,
        error: [
          Unauthorized,
          NotFound,
          Forbidden,
          SprintCompletedImmutable,
          Validation
        ]
      }
    ).annotate(RequiresProject, "membership")
  )
  .add(
    HttpApiEndpoint.patch(
      "addTickets",
      "/orgs/:orgSlug/projects/:slug/groups/:id/tickets/add",
      {
        params: GroupPath,
        payload: UpdateGroupTicketsInput,
        success: UpdateGroupTicketsOutput,
        error: [
          Unauthorized,
          NotFound,
          Forbidden,
          SprintCompletedImmutable,
          Validation
        ]
      }
    ).annotate(RequiresProject, "membership")
  )
  .add(
    HttpApiEndpoint.patch(
      "removeTickets",
      "/orgs/:orgSlug/projects/:slug/groups/:id/tickets/remove",
      {
        params: GroupPath,
        payload: UpdateGroupTicketsInput,
        success: UpdateGroupTicketsOutput,
        error: [Unauthorized, NotFound, Forbidden, SprintCompletedImmutable]
      }
    ).annotate(RequiresProject, "membership")
  )
  .add(
    HttpApiEndpoint.post(
      "complete",
      "/orgs/:orgSlug/projects/:slug/groups/:id/complete",
      {
        params: GroupPath,
        payload: CompleteSprintInput,
        success: CompleteSprintOutput,
        error: [
          Unauthorized,
          NotFound,
          Forbidden,
          SprintCompletedImmutable,
          Validation
        ]
      }
    ).annotate(RequiresProject, { sprint: ["manage"] })
  )
  .add(
    HttpApiEndpoint.delete(
      "delete",
      "/orgs/:orgSlug/projects/:slug/groups/:id",
      {
        params: GroupPath,
        success: HttpApiSchema.NoContent,
        error: [Unauthorized, NotFound, Forbidden]
      }
    ).annotate(RequiresProject, "membership")
  )
  .middleware(ProjectAccess)
  .middleware(Authentication)
