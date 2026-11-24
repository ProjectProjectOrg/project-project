import type { BulkTicketPatch, TicketId } from "@pp/shared"

import type { RemoveTickets } from "@/features/tickets/atoms/removeTickets"
import type { Restore } from "@/features/tickets/components/ticket-list/selectionUndo"

import {
  openCommandMenu,
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
  removalView?: (slug: string, id: TicketId) => RemoveTickets | undefined
  clearSelection?: () => void
  // Applies a change to the selection and offers Undo: by the given
  // restore, or by what the selection knows of the tickets before it.
  updateSelection?: (
    slug: string,
    tickets: ReadonlyArray<TicketId>,
    patch: BulkTicketPatch,
    restore?: ReadonlyArray<Restore>
  ) => Promise<boolean>
  sprint?: SprintContext
  view?: ViewContext
  commands?: ReadonlyArray<Command>
}>

export const scopeTicket = (scopes: ReadonlyArray<CommandScope>) =>
  scopes.findLast((scope) => scope.ticket !== undefined)?.ticket ?? null

export const scopeSelection = (scopes: ReadonlyArray<CommandScope>) => {
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

export const scopeSprint = (scopes: ReadonlyArray<CommandScope>) =>
  scopes.findLast((scope) => scope.sprint !== undefined)?.sprint ?? null

export const scopeCommands = (scopes: ReadonlyArray<CommandScope>) =>
  scopes.flatMap((scope) => scope.commands ?? [])

export const scopeView = (scopes: ReadonlyArray<CommandScope>) =>
  scopes.findLast((scope) => scope.view !== undefined)?.view ?? null

export type CommandTarget = Readonly<{
  ticket: TicketContext | null
  selection: ReadonlyArray<SelectedTicket>
}>

export const commandTarget = (
  orgSlug: string,
  scopes: ReadonlyArray<CommandScope>,
  pointed: PointedTicket | null
) => {
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
) => {
  const target = commandTarget(orgSlug, scopes, pointed)
  return openCommandMenu(target.ticket, "root", target.selection, pointed)
}
