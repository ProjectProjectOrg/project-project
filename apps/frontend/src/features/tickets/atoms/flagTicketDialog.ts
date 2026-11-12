import type { TicketId } from "@pp/shared"
import * as Atom from "effect/reactivity/Atom"

import type { TicketContext } from "@/features/command-menu/lib/commandMenu"
import type { CommandEnv } from "@/features/command-menu/lib/commands"

export type FlagTicketDialogRequest = Readonly<{
  orgSlug: string
  slug: string
  ticketId: TicketId
  title: string
}>

export const flagTicketDialog = Atom.make<FlagTicketDialogRequest | null>(
  null
).pipe(Atom.keepAlive)

export const openFlagDialog = (
  env: CommandEnv,
  ticket: TicketContext,
  title: string
) => {
  env.registry.set(flagTicketDialog, { ...ticket, title })
  env.close()
}
