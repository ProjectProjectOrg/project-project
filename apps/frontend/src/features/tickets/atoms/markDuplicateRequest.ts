import type { TicketId } from "@pp/shared"
import * as Atom from "effect/reactivity/Atom"

import type { TicketContext } from "@/features/command-menu/lib/commandMenu"

export type MarkDuplicateRequest = TicketContext &
  Readonly<{ originalId: TicketId }>

// The ticket being marked and the one it duplicates, set by the mark-as
// picker before it opens the cmd+k page that confirms it.
export const markDuplicateRequest = Atom.make<MarkDuplicateRequest | null>(
  null
).pipe(Atom.keepAlive)
