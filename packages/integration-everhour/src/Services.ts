import * as Layer from "effect/Layer"

import { EverhourApiKeys } from "./ApiKeys"
import { EverhourLive } from "./Client"
import { EverhourEvents } from "./Events"
import { EverhourIntegrationsLive } from "./Integrations"
import { EverhourTimeTrackingLive } from "./TimeTracking"
import { EverhourWebhooksLive } from "./Webhooks"

export const EverhourServicesLive = EverhourWebhooksLive.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      EverhourTimeTrackingLive,
      EverhourIntegrationsLive,
      EverhourEvents.layer
    )
  ),
  Layer.provideMerge(EverhourApiKeys.layer),
  Layer.provideMerge(EverhourLive)
)
