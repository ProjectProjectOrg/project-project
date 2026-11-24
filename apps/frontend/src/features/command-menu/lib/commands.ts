import type {
  Group,
  OrgActor,
  ProjectActor,
  ProjectDetail,
  Ticket,
  TicketDetail,
  Tools
} from "@pp/shared"
import type { IconComponent } from "@pp/ui/lib/icon"
import type { AppHotkey } from "@tanstack/react-hotkeys"
import * as Data from "effect/Data"
import type * as AsyncResult from "effect/reactivity/AsyncResult"
import type * as Atom from "effect/reactivity/Atom"
import type { AtomRegistry } from "effect/reactivity/AtomRegistry"
import type { ReactNode } from "react"

import type { TicketPermissions } from "@/features/tickets/lib/ticketPermissions"
import type { TicketNavigationSearch } from "@/features/tickets/lib/ticketSearch"

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
  orgName: string | null
  orgActor: OrgActor
  projectActor: ProjectActor | null
  projectSlug: string | null
  routeProjectSlug: string | null
  ticket: TicketContext | null
  selection: ReadonlyArray<SelectedTicket>
  ticketData: Ticket | null
  ticketDetail: TicketDetail | null
  ticketSprint: Group | null
  ticketSubscribed: boolean | null
  sprint: SprintContext | null
  view: ViewContext | null
  viewerId: string | null
  canSeeOrgMembers: boolean
  canCreateProjects: boolean
  hasFeedbackDraft: boolean
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
  navigate: (to: string, search?: TicketNavigationSearch) => void
  copy: (text: string) => void
  open: (page: CommandPage, from?: ReturnPoint) => void
  actOn: (ticket: TicketContext, from: ReturnPoint) => void
  close: () => void
}>

type CommandFields = Readonly<{
  id: string
  group: CommandGroup
  label: (context: CommandContext) => string
  aside?: (context: CommandContext) => ReactNode
  parent?: (context: CommandContext) => ReadonlyArray<string>
  listed?: "always" | "search" | "never"
  icon: IconComponent
  keywords?: ReadonlyArray<string>
  hotkey?: AppHotkey
  tool?: ToolName
  bulk?: boolean
  when?: (context: CommandContext) => boolean
}>

export type Command = Data.TaggedEnum<{
  page: CommandFields & Readonly<{ page: CommandPage }>
  run: CommandFields &
    Readonly<{ run: (context: CommandContext, env: CommandEnv) => void }>
}>
export const Command = Data.taggedEnum<Command>()

const appliesToSelection = (command: Command, context: CommandContext) =>
  context.selection.length < 2 ||
  !command.group.startsWith("ticket") ||
  command.bulk === true

export const visibleCommands = <C extends Command>(
  commands: ReadonlyArray<C>,
  context: CommandContext
) =>
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
) => {
  if (command.when?.(context) === false) return
  Command.$match(command, {
    page: ({ page }) => env.open(page),
    run: ({ run }) => run(context, env)
  })
}
