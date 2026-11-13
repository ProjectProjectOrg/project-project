import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"

import { ProjectAccess, RequiresProject } from "../access/ProjectAccess"
import { Authentication } from "../auth/Authentication"
import { Forbidden, NotFound, Unauthorized } from "../errors"
import { TicketPath } from "../http/paths"
import { TicketSubscribers } from "./TicketSubscribers"

const subscribersPath = "/orgs/:orgSlug/projects/:slug/tickets/:id/subscribers"
const subscriptionPath =
  "/orgs/:orgSlug/projects/:slug/tickets/:id/subscription"

export const TicketSubscriptionsGroup = HttpApiGroup.make("ticketSubscriptions")
  .add(
    HttpApiEndpoint.get("list", subscribersPath, {
      params: TicketPath,
      success: TicketSubscribers,
      error: [Unauthorized, NotFound, Forbidden]
    }).annotate(RequiresProject, { ticket: ["read"] })
  )
  .add(
    HttpApiEndpoint.put("subscribe", subscriptionPath, {
      params: TicketPath,
      success: TicketSubscribers,
      error: [Unauthorized, NotFound, Forbidden]
    }).annotate(RequiresProject, "membership")
  )
  .add(
    HttpApiEndpoint.delete("unsubscribe", subscriptionPath, {
      params: TicketPath,
      success: TicketSubscribers,
      error: [Unauthorized, NotFound, Forbidden]
    }).annotate(RequiresProject, "membership")
  )
  .middleware(ProjectAccess)
  .middleware(Authentication)
