import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"

import { Authentication } from "../auth/Authentication"
import { Unauthorized } from "../errors"
import { LiveEvent, LiveEventsQuery } from "./LiveEvent"

export const LiveGroup = HttpApiGroup.make("live")
  .add(
    HttpApiEndpoint.get("events", "/events", {
      query: LiveEventsQuery,
      success: HttpApiSchema.StreamSse({ data: LiveEvent }),
      error: [Unauthorized]
    })
  )
  .middleware(Authentication)
