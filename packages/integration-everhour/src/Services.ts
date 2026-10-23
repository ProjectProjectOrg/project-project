import * as Layer from "effect/Layer"

import { EverhourLive } from "./Client"
import { EverhourIntegrationsLive } from "./Integrations"
import { EverhourTimeTrackingLive } from "./TimeTracking"
import { EverhourWebhooksLive } from "./Webhooks"

export const EverhourServicesLive = EverhourWebhooksLive.pipe(
  Layer.provideMerge(
    Layer.mergeAll(EverhourTimeTrackingLive, EverhourIntegrationsLive)
  ),
  Layer.provideMerge(EverhourLive)
)
