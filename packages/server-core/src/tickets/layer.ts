import * as Layer from "effect/Layer"

import * as TicketGit from "../git/TicketGit"
import * as TicketCommands from "./TicketCommands"
import * as TicketQueries from "./TicketQueries"
import * as TicketView from "./TicketView"

export const layer = Layer.mergeAll(
  TicketQueries.layer,
  TicketCommands.layer,
  TicketGit.layer
).pipe(Layer.provide(TicketView.layer))
