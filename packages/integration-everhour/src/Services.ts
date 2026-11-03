import * as Layer from "effect/Layer"

import { EverhourApiKeys } from "./ApiKeys"
import * as Client from "./Client"
import { EverhourEvents } from "./Events"
import * as Integrations from "./Integrations"
import * as TimeTracking from "./TimeTracking"
import * as Webhooks from "./Webhooks"

export const EverhourServicesLive = Webhooks.layer.pipe(
  Layer.provideMerge(
    Layer.mergeAll(TimeTracking.layer, Integrations.layer, EverhourEvents.layer)
  ),
  Layer.provideMerge(EverhourApiKeys.layer),
  Layer.provideMerge(Client.layer)
)
