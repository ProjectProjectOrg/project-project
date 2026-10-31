import * as Layer from "effect/Layer"

import { TicketIndexLive } from "./TicketIndexLive"
import * as TicketIndexMaintenance from "./TicketIndexMaintenance"
import * as TicketIndexRepairs from "./TicketIndexRepairs"

export const layer = Layer.mergeAll(
  TicketIndexLive,
  TicketIndexMaintenance.layer
).pipe(Layer.provide(TicketIndexRepairs.layer))
