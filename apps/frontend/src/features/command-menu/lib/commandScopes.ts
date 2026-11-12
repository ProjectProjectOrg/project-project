import type { BulkTicketPatch, TicketId } from "@pp/shared"

import type {
  SelectedTicket,
  SprintContext,
  TicketContext,
  ViewContext
} from "./commandMenu"
import type { Command } from "./commands"

export type ScopedSelection = Readonly<{
  slug: string
  tickets: ReadonlyArray<SelectedTicket>
}>

export type CommandScope = Readonly<{
  ticket?: TicketContext
  selection?: () => ScopedSelection | null
  clearSelection?: () => void
  updateSelection?: (
    slug: string,
    tickets: ReadonlyArray<TicketId>,
    patch: BulkTicketPatch
  ) => Promise<boolean>
  sprint?: SprintContext
  view?: ViewContext
  commands?: ReadonlyArray<Command>
}>

export const scopeTicket = (
  scopes: ReadonlyArray<CommandScope>
): TicketContext | null =>
  scopes.findLast((scope) => scope.ticket !== undefined)?.ticket ?? null

export const scopeSelection = (
  scopes: ReadonlyArray<CommandScope>
): ScopedSelection | null => {
  for (const scope of scopes.toReversed()) {
    const picked = scope.selection?.()
    if (picked !== undefined && picked !== null) return picked
  }
  return null
}

export const scopeSelectionUpdate = (scopes: ReadonlyArray<CommandScope>) =>
  scopes.findLast((scope) => scope.updateSelection !== undefined)
    ?.updateSelection ?? null

export const scopeSelectionClear = (scopes: ReadonlyArray<CommandScope>) =>
  scopes.findLast((scope) => scope.clearSelection !== undefined)
    ?.clearSelection ?? null

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
