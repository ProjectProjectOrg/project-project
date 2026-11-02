import * as Layer from "effect/Layer"

import * as TicketIndex from "./TicketIndex"
import * as TicketIndexMaintenance from "./TicketIndexMaintenance"
import * as TicketIndexRepairs from "./TicketIndexRepairs"

export const layer = Layer.mergeAll(
  TicketIndex.layer,
  TicketIndexMaintenance.layer
).pipe(Layer.provide(TicketIndexRepairs.layer))
