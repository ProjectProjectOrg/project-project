import type { Group, Ticket, TicketId } from "@pp/shared"

import type { FilterOption } from "@/features/tickets/hooks/useFilterOptions"
import type {
  FilterChoice,
  ValueFilterDimension
} from "@/features/tickets/lib/filterChoices"
import type { MarkPickKind } from "@/features/tickets/lib/relationGroups"

export type TicketContext = Readonly<{
  orgSlug: string
  slug: string
  ticketId: TicketId
}>

export type SelectedTicket = Pick<
  Ticket,
  | "id"
  | "title"
  | "status"
  | "priority"
  | "type"
  | "estimate"
  | "tags"
  | "assignees"
>

export type SprintContext = Readonly<{
  orgSlug: string
  slug: string
  sprint: Group
  sprints: ReadonlyArray<Group>
  canPlan: boolean
}>

export type ViewContext = Readonly<{
  options: ReadonlyArray<FilterOption>
  toggle: (choice: FilterChoice) => void
  prefetch: (choice: FilterChoice) => void
}>

export type SprintPage =
  | "sprintSchedule"
  | "sprintComplete"
  | "sprintLength"
  | "sprintRename"
  | "sprintAddTickets"
  | "sprintDelete"
  | "sprintPlan"

export type CommandPage =
  | "root"
  | SprintPage
  | "ticketStatus"
  | "ticketPriority"
  | "ticketAssignee"
  | "ticketSprint"
  | "ticketMove"
  | "ticketMarkAs"
  | "ticketEstimate"
  | "ticketType"
  | "ticketTags"
  | "ticketParent"
  | "ticketSubTicket"
  | "ticketCreateRelated"
  | "ticketRemoveRelation"
  | "ticketArchive"
  | "ticketDelete"
  | "ticketBranch"
  | "ticketLinkBranch"
  | "ticketStackBranch"
  | "switchOrg"
  | "switchProject"
  | "createProject"
  | "theme"
  | "editorPreference"
  | "viewFilter"
  | FilterPage
  | MarkPage

export type FilterPage = `filter:${ValueFilterDimension}`

export type MarkPage = `mark:${MarkPickKind}`

export type ReturnPoint = Readonly<{ search: string; value: string }>

type Frame = Readonly<{
  ticket: TicketContext | null
  selection: ReadonlyArray<SelectedTicket>
  pages: readonly [CommandPage, ...ReadonlyArray<CommandPage>]
}>

type Step = Frame & Readonly<{ from: ReturnPoint | null }>

export type CommandMenuState = Frame &
  Readonly<{
    open: boolean
    trail: ReadonlyArray<Step>
    search: string
    focus: string | null
  }>

export const CLOSED_COMMAND_MENU: CommandMenuState = {
  open: false,
  ticket: null,
  selection: [],
  pages: ["root"],
  trail: [],
  search: "",
  focus: null
}

const SELECTION_PAGES: ReadonlySet<CommandPage> = new Set<CommandPage>([
  "root",
  "ticketStatus",
  "ticketPriority",
  "ticketAssignee",
  "ticketSprint",
  "ticketEstimate",
  "ticketType",
  "ticketTags",
  "ticketArchive",
  "ticketDelete"
])

export const openCommandMenu = (
  ticket: TicketContext | null,
  page: CommandPage = "root",
  selection: ReadonlyArray<SelectedTicket> = []
): CommandMenuState => ({
  ...CLOSED_COMMAND_MENU,
  open: true,
  ticket,
  selection: selection.length > 1 && SELECTION_PAGES.has(page) ? selection : [],
  pages: [page]
})

export const deselectFromCommandMenu = (
  state: CommandMenuState,
  ticketId: TicketId
): CommandMenuState => {
  const selection = state.selection.filter((each) => each.id !== ticketId)
  const [only] = selection
  if (selection.length > 1 || only === undefined) return { ...state, selection }
  return {
    ...state,
    selection: [],
    ticket:
      state.ticket === null ? null : { ...state.ticket, ticketId: only.id }
  }
}

const deeper = (
  state: CommandMenuState,
  from: ReturnPoint | null
): CommandMenuState => ({
  ...state,
  trail: [
    ...state.trail,
    {
      ticket: state.ticket,
      selection: state.selection,
      pages: state.pages,
      from
    }
  ],
  search: "",
  focus: null
})

export const actOnTicket = (
  state: CommandMenuState,
  ticket: TicketContext,
  from: ReturnPoint
): CommandMenuState => ({
  ...deeper(state, from),
  ticket,
  selection: [],
  pages: ["root"]
})

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

const stepBack = (state: CommandMenuState): Step | null => {
  const last = state.trail.at(-1)
  if (last !== undefined) return last
  if (state.pages[0] !== "root") {
    return {
      ticket: state.ticket,
      selection: state.selection,
      pages: ["root"],
      from: null
    }
  }
  return state.ticket === null
    ? null
    : { ticket: null, selection: [], pages: ["root"], from: null }
}

export const backCommandMenu = (state: CommandMenuState): CommandMenuState => {
  const step = stepBack(state)
  if (step === null) return state
  return {
    ...state,
    ticket: step.ticket,
    selection: step.selection,
    pages: step.pages,
    trail: state.trail.slice(0, -1),
    search: step.from?.search ?? "",
    focus: step.from?.value ?? null
  }
}
