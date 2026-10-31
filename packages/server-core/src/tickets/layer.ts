import * as Layer from "effect/Layer"

import * as TicketGit from "./TicketGit"
import * as TicketQueries from "./TicketQueries"
import { TicketsLive } from "./TicketsLive"
import * as TicketView from "./TicketView"

export const layer = Layer.mergeAll(
  TicketsLive,
  TicketQueries.layer,
  TicketGit.layer
).pipe(Layer.provide(TicketView.layer))
