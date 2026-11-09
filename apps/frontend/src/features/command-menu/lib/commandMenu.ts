import type { Group, TicketId } from "@pp/shared"

import type { MarkPickKind } from "@/features/tickets/lib/relationGroups"

export type TicketContext = Readonly<{
  orgSlug: string
  slug: string
  ticketId: TicketId
}>

export type SprintContext = Readonly<{
  orgSlug: string
  slug: string
  sprint: Group
  sprints: ReadonlyArray<Group>
  canPlan: boolean
}>

export type SprintPage =
  | "sprintSchedule"
  | "sprintComplete"
  | "sprintLength"
  | "sprintRename"
  | "sprintAddTickets"
  | "sprintDelete"

export type CommandPage =
  | "root"
  | SprintPage
  | "ticketStatus"
  | "ticketPriority"
  | "ticketAssignee"
  | "ticketSprint"
  | "ticketMarkAs"
  | "ticketEstimate"
  | "ticketType"
  | "ticketTags"
  | "ticketParent"
  | "ticketDelete"
  | "ticketBranch"
  | "ticketLinkBranch"
  | "ticketStackBranch"
  | "switchOrg"
  | "switchProject"
  | "createProject"
  | "theme"
  | MarkPage

export type MarkPage = `mark:${MarkPickKind}`

export type ReturnPoint = Readonly<{ search: string; value: string }>

export type CommandMenuState = Readonly<{
  open: boolean
  ticket: TicketContext | null
  pages: readonly [CommandPage, ...ReadonlyArray<CommandPage>]
  trail: ReadonlyArray<ReturnPoint | null>
  search: string
  focus: string | null
}>

export const CLOSED_COMMAND_MENU: CommandMenuState = {
  open: false,
  ticket: null,
  pages: ["root"],
  trail: [],
  search: "",
  focus: null
}

export const openCommandMenu = (
  ticket: TicketContext | null,
  page: CommandPage = "root"
): CommandMenuState => ({
  ...CLOSED_COMMAND_MENU,
  open: true,
  ticket,
  pages: [page]
})

const deeper = (
  state: CommandMenuState,
  from: ReturnPoint | null
): CommandMenuState => ({
  ...state,
  trail: [...state.trail, from],
  search: "",
  focus: null
})

export const actOnTicket = (
  state: CommandMenuState,
  ticket: TicketContext,
  from: ReturnPoint
): CommandMenuState => ({ ...deeper(state, from), ticket, pages: ["root"] })

export const pushCommandPage = (
  state: CommandMenuState,
  page: CommandPage,
  from: ReturnPoint | null = null
): CommandMenuState => ({
  ...deeper(state, from),
  pages: [...state.pages, page]
})

export const currentCommandPage = (state: CommandMenuState): CommandPage =>
  state.pages.at(-1) ?? "root"

const stepBack = (state: CommandMenuState): CommandMenuState | null => {
  const [first, ...rest] = state.pages
  if (rest.length > 0) return { ...state, pages: [first, ...rest.slice(0, -1)] }
  if (first !== "root") return { ...state, pages: ["root"] }
  return state.ticket === null ? null : { ...state, ticket: null }
}

export const backCommandMenu = (state: CommandMenuState): CommandMenuState => {
  const previous = stepBack(state)
  if (previous === null) return state
  const from = state.trail.at(-1) ?? null
  return {
    ...previous,
    trail: state.trail.slice(0, -1),
    search: from?.search ?? "",
    focus: from?.value ?? null
  }
}
