import type {
  Group,
  OrgActor,
  ProjectActor,
  ProjectDetail,
  TicketDetail,
  Tools
} from "@pp/shared"
import type * as AsyncResult from "effect/reactivity/AsyncResult"
import type * as Atom from "effect/reactivity/Atom"
import type { AtomRegistry } from "effect/reactivity/AtomRegistry"
import type { ReactNode } from "react"

import type { TicketPermissions } from "@/features/tickets/lib/ticketPermissions"
import type { IconComponent } from "@/lib/icon"

import type {
  CommandPage,
  ReturnPoint,
  SelectedTicket,
  SprintContext,
  TicketContext,
  ViewContext
} from "./commandMenu"

export type ToolName = keyof (typeof Tools)["tools"]

export const COMMAND_GROUPS = [
  "ticket",
  "ticketRelations",
  "ticketGit",
  "ticketActions",
  "sprint",
  "backlog",
  "view",
  "create",
  "setup",
  "navigation",
  "miscellaneous",
  "settings",
  "account"
] as const

export type CommandGroup = (typeof COMMAND_GROUPS)[number]

export type CommandContext = Readonly<{
  orgSlug: string
  orgActor: OrgActor
  projectActor: ProjectActor | null
  projectSlug: string | null
  ticket: TicketContext | null
  selection: ReadonlyArray<SelectedTicket>
  ticketDetail: TicketDetail | null
  ticketSprint: Group | null
  ticketSubscribed: boolean | null
  sprint: SprintContext | null
  view: ViewContext | null
  viewerId: string | null
  canSeeOrgMembers: boolean
  canCreateProjects: boolean
  canSendFeedback: boolean
  canHoldChildren: boolean
  project: ProjectDetail | null
  tickets: TicketPermissions
  canManageProject: boolean
}>

export type CommandEnv = Readonly<{
  registry: AtomRegistry
  execute: <W>(
    atom: Atom.Writable<AsyncResult.AsyncResult<unknown, unknown>, W>,
    value: W
  ) => void
  navigate: (to: string) => void
  copy: (text: string) => void
  open: (page: CommandPage, from?: ReturnPoint) => void
  actOn: (ticket: TicketContext, from: ReturnPoint) => void
  close: () => void
}>

type CommandAction =
  | Readonly<{ page: CommandPage }>
  | Readonly<{ run: (context: CommandContext, env: CommandEnv) => void }>

export type Command = Readonly<{
  id: string
  group: CommandGroup
  label: (context: CommandContext) => string
  aside?: (context: CommandContext) => ReactNode
  parent?: () => string
  searchOnly?: boolean
  icon: IconComponent
  keywords?: ReadonlyArray<string>
  shortcut?: string
  tool?: ToolName
  bulk?: boolean
  when?: (context: CommandContext) => boolean
}> &
  CommandAction

const appliesToSelection = (command: Command, context: CommandContext) =>
  context.selection.length < 2 ||
  !command.group.startsWith("ticket") ||
  command.bulk === true

export const visibleCommands = <C extends Command>(
  commands: ReadonlyArray<C>,
  context: CommandContext
): ReadonlyArray<C> =>
  COMMAND_GROUPS.flatMap((group) =>
    commands.filter(
      (command) =>
        command.group === group &&
        appliesToSelection(command, context) &&
        (command.when?.(context) ?? true)
    )
  )

export const runCommand = (
  command: Command,
  context: CommandContext,
  env: CommandEnv
): void => {
  if (command.when?.(context) === false) return
  if ("page" in command) env.open(command.page)
  else command.run(context, env)
}
