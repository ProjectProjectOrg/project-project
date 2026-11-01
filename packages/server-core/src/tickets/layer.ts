import * as Layer from "effect/Layer"

import * as TicketCommands from "./TicketCommands"
import * as TicketGit from "./TicketGit"
import * as TicketQueries from "./TicketQueries"
import * as TicketView from "./TicketView"

export const layer = Layer.mergeAll(
  TicketQueries.layer,
  TicketCommands.layer,
  TicketGit.layer
).pipe(Layer.provide(TicketView.layer))
