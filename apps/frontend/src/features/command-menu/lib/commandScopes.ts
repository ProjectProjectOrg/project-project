import type { SprintContext, TicketContext, ViewContext } from "./commandMenu"
import type { Command } from "./commands"

export type CommandScope = Readonly<{
  ticket?: TicketContext
  sprint?: SprintContext
  view?: ViewContext
  commands?: ReadonlyArray<Command>
}>

export const scopeTicket = (
  scopes: ReadonlyArray<CommandScope>
): TicketContext | null =>
  scopes.findLast((scope) => scope.ticket !== undefined)?.ticket ?? null

export const scopeSprint = (
  scopes: ReadonlyArray<CommandScope>
): SprintContext | null =>
  scopes.findLast((scope) => scope.sprint !== undefined)?.sprint ?? null

export const scopeCommands = (
  scopes: ReadonlyArray<CommandScope>
): ReadonlyArray<Command> => scopes.flatMap((scope) => scope.commands ?? [])

export const scopeView = (
  scopes: ReadonlyArray<CommandScope>
): ViewContext | null =>
  scopes.findLast((scope) => scope.view !== undefined)?.view ?? null
