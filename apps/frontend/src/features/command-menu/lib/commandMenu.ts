import type { Group, Ticket, TicketId } from "@pp/shared"

import type { FilterOption } from "@/features/tickets/hooks/useFilterOptions"
import type {
  FilterChoice,
  ValueFilterDimension
} from "@/features/tickets/lib/filterChoices"
import type { MarkPickKind } from "@/features/tickets/lib/relationGroups"
import type { TicketEdit } from "@/features/tickets/lib/ticketPatch"
import type { TicketNavigationSearch } from "@/features/tickets/lib/ticketSearch"

export type TicketContext = Readonly<{
  orgSlug: string
  slug: string
  ticketId: TicketId
}>

export type PointedTicket = TicketContext &
  Readonly<{
    row: Ticket
    patch: (edit: TicketEdit) => void
    search: TicketNavigationSearch | undefined
  }>

export const pointedAt = (
  pointed: PointedTicket | null,
  ticket: TicketContext | null
) =>
  pointed !== null &&
  ticket !== null &&
  pointed.ticketId === ticket.ticketId &&
  pointed.slug === ticket.slug &&
  pointed.orgSlug === ticket.orgSlug
    ? pointed
    : null

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
  | "flag"
  | "rank"
  | "subTicketCount"
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
  | "ticketFlag"
  | "ticketDuplicate"
  | "ticketDelete"
  | "githubRegisterApp"
  | "githubInstallApp"
  | "ticketBranch"
  | "ticketLinkBranch"
  | "ticketStackBranch"
  | "switchOrg"
  | "switchProject"
  | "createProject"
  | "createSprint"
  | "createTicket"
  | "sendFeedback"
  | "theme"
  | "shortcuts"
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
    row: PointedTicket | null
    trail: ReadonlyArray<Step>
    search: string
    focus: string | null
  }>

export const CLOSED_COMMAND_MENU: CommandMenuState = {
  open: false,
  row: null,
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
  "ticketFlag",
  "ticketDelete"
])

export const openCommandMenu = (
  ticket: TicketContext | null,
  page: CommandPage = "root",
  selection: ReadonlyArray<SelectedTicket> = [],
  pointed: PointedTicket | null = null
) =>
  ({
    ...CLOSED_COMMAND_MENU,
    open: true,
    row: pointedAt(pointed, ticket),
    ticket,
    selection:
      selection.length > 1 && SELECTION_PAGES.has(page) ? selection : [],
    pages: [page]
  }) satisfies CommandMenuState

const deselect = <F extends Frame>(frame: F, ticketId: TicketId) => {
  const selection = frame.selection.filter((each) => each.id !== ticketId)
  const [first] = selection
  if (first === undefined) return { ...frame, selection }
  return {
    ...frame,
    selection: selection.length > 1 ? selection : [],
    ticket:
      frame.ticket === null || frame.ticket.ticketId !== ticketId
        ? frame.ticket
        : { ...frame.ticket, ticketId: first.id }
  }
}

export const deselectFromCommandMenu = (
  state: CommandMenuState,
  ticketId: TicketId
) =>
  ({
    ...deselect(state, ticketId),
    trail: state.trail.map((step) => deselect(step, ticketId))
  }) satisfies CommandMenuState

const deeper = (state: CommandMenuState, from: ReturnPoint | null) =>
  ({
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
  }) satisfies CommandMenuState

export const actOnTicket = (
  state: CommandMenuState,
  ticket: TicketContext,
  from: ReturnPoint
) =>
  ({
    ...deeper(state, from),
    ticket,
    selection: [],
    pages: ["root"]
  }) satisfies CommandMenuState

export const pushCommandPage = (
  state: CommandMenuState,
  page: CommandPage,
  from: ReturnPoint | null = null
) =>
  ({
    ...deeper(state, from),
    pages: [...state.pages, page]
  }) satisfies CommandMenuState

export const currentCommandPage = (state: CommandMenuState) =>
  state.pages.at(-1) ?? "root"

const stepBack = (state: CommandMenuState) => {
  const last = state.trail.at(-1)
  if (last !== undefined) return last
  if (state.pages[0] !== "root") {
    return {
      ticket: state.ticket,
      selection: state.selection,
      pages: ["root"],
      from: null
    } satisfies Step
  }
  return state.ticket === null
    ? null
    : ({
        ticket: null,
        selection: [],
        pages: ["root"],
        from: null
      } satisfies Step)
}

export const backCommandMenu = (state: CommandMenuState) => {
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
  } satisfies CommandMenuState
}
