import type { TicketId } from "@pp/shared"
import * as Atom from "effect/reactivity/Atom"

import type { TicketContext } from "@/features/command-menu/lib/commandMenu"

export type MarkDuplicateDialogRequest = TicketContext &
  Readonly<{ originalId: TicketId }>

export const markDuplicateDialog = Atom.make<MarkDuplicateDialogRequest | null>(
  null
).pipe(Atom.keepAlive)
