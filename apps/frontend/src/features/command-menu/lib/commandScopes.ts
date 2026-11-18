import type { TicketContext } from "./commandMenu"
import type { Command } from "./commands"

export type CommandScope = Readonly<{
  ticket?: TicketContext
  commands?: ReadonlyArray<Command>
}>

export const scopeTicket = (
  scopes: ReadonlyArray<CommandScope>
): TicketContext | null =>
  scopes.findLast((scope) => scope.ticket !== undefined)?.ticket ?? null

export const scopeCommands = (
  scopes: ReadonlyArray<CommandScope>
): ReadonlyArray<Command> => scopes.flatMap((scope) => scope.commands ?? [])
