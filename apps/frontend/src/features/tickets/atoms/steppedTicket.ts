import type { TicketId } from "@pp/shared"
import * as Atom from "effect/reactivity/Atom"

export type SteppedTicket = Readonly<{
  urlId: TicketId
  id: TicketId
  title: string
}>

export const steppedTicket = Atom.make<SteppedTicket | null>(null).pipe(
  Atom.keepAlive
)
