import * as Layer from "effect/Layer"

import * as TicketQueries from "./TicketQueries"
import { TicketsLive } from "./TicketsLive"
import * as TicketView from "./TicketView"

export const layer = Layer.mergeAll(TicketsLive, TicketQueries.layer).pipe(
  Layer.provide(TicketView.layer)
)
