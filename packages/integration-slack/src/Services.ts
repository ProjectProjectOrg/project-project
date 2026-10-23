import * as Layer from "effect/Layer"

import { SlackClient } from "./Client"
import { SlackDelivery, SlackDeliveryWorkflowLive } from "./Delivery"
import { SlackEvents } from "./Events"
import { SlackIntegrations } from "./Integrations"
import { SlackPreviews } from "./Previews"

export const SlackServicesLive = SlackDeliveryWorkflowLive.pipe(
  Layer.provideMerge(SlackDelivery.layer),
  Layer.provideMerge(SlackPreviews.layer),
  Layer.provideMerge(SlackEvents.layer),
  Layer.provideMerge(SlackIntegrations.layer),
  Layer.provideMerge(SlackClient.layer)
)
