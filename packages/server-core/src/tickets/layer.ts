import * as Layer from "effect/Layer"

import * as TicketGit from "../git/TicketGit"
import * as TicketCommands from "./TicketCommands"
import * as TicketDescriber from "./TicketDescriber"
import * as TicketDescriptions from "./TicketDescriptions"
import * as TicketQueries from "./TicketQueries"
import * as TicketView from "./TicketView"

export const layer = Layer.mergeAll(
  TicketQueries.layer,
  TicketDescriptions.layer.pipe(
    Layer.provideMerge(TicketCommands.layer),
    Layer.provideMerge(TicketDescriber.layer)
  ),
  TicketGit.layer
).pipe(Layer.provide(TicketView.layer))
