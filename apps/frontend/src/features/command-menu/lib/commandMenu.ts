import type { TicketId } from "@pp/shared"

import type { MarkPickKind } from "@/features/tickets/lib/relationGroups"

export type TicketContext = Readonly<{
  orgSlug: string
  slug: string
  ticketId: TicketId
}>

export type CommandPage =
  | "root"
  | "ticketStatus"
  | "ticketPriority"
  | "ticketAssignee"
  | "switchOrg"
  | "theme"
  | MarkPage

export type MarkPage = `mark:${MarkPickKind}`

export type CommandMenuState = Readonly<{
  open: boolean
  ticket: TicketContext | null
  pages: readonly [CommandPage, ...ReadonlyArray<CommandPage>]
}>

export const CLOSED_COMMAND_MENU: CommandMenuState = {
  open: false,
  ticket: null,
  pages: ["root"]
}

export const openCommandMenu = (
  ticket: TicketContext | null,
  page: CommandPage = "root"
): CommandMenuState => ({ open: true, ticket, pages: [page] })

export const pushCommandPage = (
  state: CommandMenuState,
  page: CommandPage
): CommandMenuState => ({ ...state, pages: [...state.pages, page] })

export const currentCommandPage = (state: CommandMenuState): CommandPage =>
  state.pages.at(-1) ?? "root"

export const backCommandMenu = (state: CommandMenuState): CommandMenuState => {
  const [first, ...rest] = state.pages
  if (rest.length > 0) {
    return { ...state, pages: [first, ...rest.slice(0, -1)] }
  }
  if (first !== "root") return { ...state, pages: ["root"] }
  return state.ticket === null ? state : { ...state, ticket: null }
}
