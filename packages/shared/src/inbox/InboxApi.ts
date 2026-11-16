import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import * as Schema from "effect/Schema"

import { OrgAccess, RequiresOrg } from "../access/OrgAccess"
import { ProjectAccess, RequiresProject } from "../access/ProjectAccess"
import { Authentication } from "../auth/Authentication"
import { Forbidden, NotFound, Unauthorized } from "../errors"
import { OrgPath, TicketPath } from "../http/paths"
import { InboxItem, InboxListQuery, InboxUnread } from "./InboxItem"

const readPath = "/orgs/:orgSlug/projects/:slug/tickets/:id/read"

export const InboxGroup = HttpApiGroup.make("inbox")
  .add(
    HttpApiEndpoint.get("list", "/orgs/:orgSlug/inbox", {
      params: OrgPath,
      query: InboxListQuery,
      success: Schema.Array(InboxItem),
      error: [Unauthorized, NotFound]
    })
      .annotate(RequiresOrg, "membership")
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.get("unread", "/orgs/:orgSlug/inbox/unread", {
      params: OrgPath,
      success: InboxUnread,
      error: [Unauthorized, NotFound]
    })
      .annotate(RequiresOrg, "membership")
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.post("readAll", "/orgs/:orgSlug/inbox/read", {
      params: OrgPath,
      success: HttpApiSchema.NoContent,
      error: [Unauthorized, NotFound]
    })
      .annotate(RequiresOrg, "membership")
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.post("doneAll", "/orgs/:orgSlug/inbox/done", {
      params: OrgPath,
      success: HttpApiSchema.NoContent,
      error: [Unauthorized, NotFound]
    })
      .annotate(RequiresOrg, "membership")
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.put("markRead", readPath, {
      params: TicketPath,
      success: HttpApiSchema.NoContent,
      error: [Unauthorized, NotFound, Forbidden]
    })
      .annotate(RequiresProject, { ticket: ["read"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.delete("markUnread", readPath, {
      params: TicketPath,
      success: HttpApiSchema.NoContent,
      error: [Unauthorized, NotFound, Forbidden]
    })
      .annotate(RequiresProject, { ticket: ["read"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.put(
      "markDone",
      "/orgs/:orgSlug/projects/:slug/tickets/:id/done",
      {
        params: TicketPath,
        success: HttpApiSchema.NoContent,
        error: [Unauthorized, NotFound, Forbidden]
      }
    )
      .annotate(RequiresProject, { ticket: ["read"] })
      .middleware(ProjectAccess)
  )
  .middleware(Authentication)
