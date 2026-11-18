import type { BulkTicketPatch, TicketId } from "@pp/shared"

import {
  openCommandMenu,
  type CommandMenuState,
  type PointedTicket,
  type SelectedTicket,
  type SprintContext,
  type TicketContext,
  type ViewContext
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

export type CommandTarget = Readonly<{
  ticket: TicketContext | null
  selection: ReadonlyArray<SelectedTicket>
}>

export const commandTarget = (
  orgSlug: string,
  scopes: ReadonlyArray<CommandScope>,
  pointed: PointedTicket | null
): CommandTarget => {
  const selection = scopeSelection(scopes)
  const [first] = selection?.tickets ?? []
  if (selection !== null && first !== undefined) {
    return {
      ticket: { orgSlug, slug: selection.slug, ticketId: first.id },
      selection: selection.tickets
    }
  }
  const ticket =
    pointed === null
      ? scopeTicket(scopes)
      : {
          orgSlug: pointed.orgSlug,
          slug: pointed.slug,
          ticketId: pointed.ticketId
        }
  return { ticket, selection: [] }
}

export const openFromScopes = (
  orgSlug: string,
  scopes: ReadonlyArray<CommandScope>,
  pointed: PointedTicket | null
): CommandMenuState => {
  const target = commandTarget(orgSlug, scopes, pointed)
  return openCommandMenu(target.ticket, "root", target.selection, pointed)
}
