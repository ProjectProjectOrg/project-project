import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import * as Schema from "effect/Schema"

import { OrgAccess, RequiresOrg } from "../access/OrgAccess"
import { ProjectAccess, RequiresProject } from "../access/ProjectAccess"
import { Authentication } from "../auth/Authentication"
import { NotFound, Unauthorized } from "../errors"
import { OrgPath, TicketPath } from "../http/paths"
import { Slug } from "../projects/Project"
import {
  InboxCount,
  InboxEntry,
  InboxEntryId,
  InboxEntryStatus,
  InboxListQuery,
  InboxReadAllPayload,
  InboxReadAllResult,
  InboxRevisionPayload,
  InboxRevisionQuery
} from "./InboxEntry"

const EntryPath = Schema.Struct({ orgSlug: Slug, id: InboxEntryId })

const entryPath = "/orgs/:orgSlug/inbox/entries/:id"

export const InboxGroup = HttpApiGroup.make("inbox")
  .add(
    HttpApiEndpoint.get("list", "/orgs/:orgSlug/inbox/entries", {
      params: OrgPath,
      query: InboxListQuery,
      success: Schema.Array(InboxEntry),
      error: [Unauthorized, NotFound]
    })
      .annotate(RequiresOrg, "membership")
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.get("count", "/orgs/:orgSlug/inbox/count", {
      params: OrgPath,
      success: InboxCount,
      error: [Unauthorized, NotFound]
    })
      .annotate(RequiresOrg, "membership")
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.put("markRead", `${entryPath}/read`, {
      params: EntryPath,
      payload: InboxRevisionPayload,
      success: InboxEntryStatus,
      error: [Unauthorized, NotFound]
    })
      .annotate(RequiresOrg, "membership")
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.put("markUnread", `${entryPath}/unread`, {
      params: EntryPath,
      success: InboxEntryStatus,
      error: [Unauthorized, NotFound]
    })
      .annotate(RequiresOrg, "membership")
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.delete("remove", entryPath, {
      params: EntryPath,
      query: InboxRevisionQuery,
      success: InboxEntryStatus,
      error: [Unauthorized, NotFound]
    })
      .annotate(RequiresOrg, "membership")
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.put("markAllRead", "/orgs/:orgSlug/inbox/read", {
      params: OrgPath,
      payload: InboxReadAllPayload,
      success: InboxReadAllResult,
      error: [Unauthorized, NotFound]
    })
      .annotate(RequiresOrg, "membership")
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.put(
      "markTicketRead",
      "/orgs/:orgSlug/projects/:slug/tickets/:id/read",
      {
        params: TicketPath,
        success: HttpApiSchema.NoContent
      }
    )
      .annotate(RequiresProject, { ticket: ["read"] })
      .middleware(ProjectAccess)
  )
  .middleware(Authentication)
