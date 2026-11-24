import type { Group, GroupId, Ticket, TicketId } from "@pp/shared"
import * as Data from "effect/Data"

import type { MarkRowRelation } from "@/features/tickets/atoms/markRowRelation"
import type { RemoveTickets } from "@/features/tickets/atoms/removeTickets"
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
    mark?: MarkRowRelation
    remove?: RemoveTickets
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

export type SprintTarget = Readonly<{
  orgSlug: string
  slug: string
  groupId: GroupId
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
  | "sprintEdit"
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
  | "settings"
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
  sprint: SprintTarget | null
  selection: ReadonlyArray<SelectedTicket>
  pages: readonly [CommandPage, ...ReadonlyArray<CommandPage>]
}>

type Step = Frame & Readonly<{ from: ReturnPoint | null }>

export type CommandMenuState = Data.TaggedEnum<{
  closed: {}
  open: Frame &
    Readonly<{
      row: PointedTicket | null
      trail: ReadonlyArray<Step>
      search: string
      focus: string | null
    }>
}>
export const CommandMenuState = Data.taggedEnum<CommandMenuState>()

export type OpenCommandMenu = Data.TaggedEnum.Value<CommandMenuState, "open">

export const CLOSED_COMMAND_MENU = CommandMenuState.closed()

export const commandMenuRow = (state: CommandMenuState) =>
  CommandMenuState.$is("open")(state) ? state.row : null

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
  CommandMenuState.open({
    row: pointedAt(pointed, ticket),
    ticket,
    sprint: null,
    selection:
      selection.length > 1 && SELECTION_PAGES.has(page) ? selection : [],
    pages: [page],
    trail: [],
    search: "",
    focus: null
  })

export const openSprintCommandMenu = (sprint: SprintTarget, page: SprintPage) =>
  CommandMenuState.open({
    row: null,
    ticket: null,
    sprint,
    selection: [],
    pages: [page],
    trail: [],
    search: "",
    focus: null
  })

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
  state: OpenCommandMenu,
  ticketId: TicketId
) =>
  ({
    ...deselect(state, ticketId),
    trail: state.trail.map((step) => deselect(step, ticketId))
  }) satisfies OpenCommandMenu

const deeper = (state: OpenCommandMenu, from: ReturnPoint | null) =>
  ({
    ...state,
    trail: [
      ...state.trail,
      {
        ticket: state.ticket,
        sprint: state.sprint,
        selection: state.selection,
        pages: state.pages,
        from
      }
    ],
    search: "",
    focus: null
  }) satisfies OpenCommandMenu

export const actOnTicket = (
  state: OpenCommandMenu,
  ticket: TicketContext,
  from: ReturnPoint
) =>
  ({
    ...deeper(state, from),
    ticket,
    sprint: null,
    selection: [],
    pages: ["root"]
  }) satisfies OpenCommandMenu

export const pushCommandPage = (
  state: OpenCommandMenu,
  page: CommandPage,
  from: ReturnPoint | null = null
) =>
  ({
    ...deeper(state, from),
    pages: [...state.pages, page]
  }) satisfies OpenCommandMenu

export const currentCommandPage = (state: OpenCommandMenu) =>
  state.pages.at(-1) ?? "root"

const stepBack = (state: OpenCommandMenu) => {
  const last = state.trail.at(-1)
  if (last !== undefined) return last
  if (state.pages[0] !== "root") {
    return {
      ticket: state.ticket,
      sprint: state.sprint,
      selection: state.selection,
      pages: ["root"],
      from: null
    } satisfies Step
  }
  return state.ticket === null && state.sprint === null
    ? null
    : ({
        ticket: null,
        sprint: null,
        selection: [],
        pages: ["root"],
        from: null
      } satisfies Step)
}

export const backCommandMenu = (state: OpenCommandMenu) => {
  const step = stepBack(state)
  if (step === null) return state
  return {
    ...state,
    ticket: step.ticket,
    sprint: step.sprint,
    selection: step.selection,
    pages: step.pages,
    trail: state.trail.slice(0, -1),
    search: step.from?.search ?? "",
    focus: step.from?.value ?? null
  } satisfies OpenCommandMenu
}
