import * as Layer from "effect/Layer"

import * as Dispatcher from "./Dispatcher"
import * as Endpoints from "./Endpoints"
import * as Events from "./Events"
import * as ProjectWebhooks from "./ProjectWebhooks"
import * as Sender from "./Sender"

export const layer = Layer.mergeAll(
  ProjectWebhooks.layer,
  Dispatcher.layer,
  Events.layer
).pipe(Layer.provideMerge(Endpoints.layer), Layer.provideMerge(Sender.layer))
