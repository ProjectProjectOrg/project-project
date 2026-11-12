import * as Atom from "effect/reactivity/Atom"

import type { TicketContext } from "@/features/command-menu/lib/commandMenu"

export const lastViewedTicket = Atom.make<TicketContext | null>(null).pipe(
  Atom.keepAlive
)
