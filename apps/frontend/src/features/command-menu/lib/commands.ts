import type { Ticket, Tools } from "@pp/shared"
import type * as AsyncResult from "effect/reactivity/AsyncResult"
import type * as Atom from "effect/reactivity/Atom"
import type { AtomRegistry } from "effect/reactivity/AtomRegistry"

import type { IconComponent } from "@/lib/icon"

import type { CommandPage, TicketContext } from "./commandMenu"

export type ToolName = keyof (typeof Tools)["tools"]

export const COMMAND_GROUPS = [
  "ticket",
  "view",
  "create",
  "navigation",
  "miscellaneous",
  "settings",
  "account"
] as const

export type CommandGroup = (typeof COMMAND_GROUPS)[number]

export type CommandContext = Readonly<{
  orgSlug: string
  projectSlug: string | null
  ticket: TicketContext | null
  ticketDetail: Ticket | null
  viewerId: string | null
  canSeeOrgMembers: boolean
}>

export type CommandEnv = Readonly<{
  registry: AtomRegistry
  execute: <W>(
    atom: Atom.Writable<AsyncResult.AsyncResult<unknown, unknown>, W>,
    value: W
  ) => void
  navigate: (to: string) => void
  copy: (text: string) => void
  open: (page: CommandPage) => void
  close: () => void
}>

type CommandAction =
  | Readonly<{ page: CommandPage }>
  | Readonly<{ run: (context: CommandContext, env: CommandEnv) => void }>

export type Command = Readonly<{
  id: string
  group: CommandGroup
  label: () => string
  parent?: () => string
  searchOnly?: boolean
  icon: IconComponent
  keywords?: ReadonlyArray<string>
  shortcut?: string
  tool?: ToolName
  when?: (context: CommandContext) => boolean
}> &
  CommandAction

export const visibleCommands = <C extends Command>(
  commands: ReadonlyArray<C>,
  context: CommandContext
): ReadonlyArray<C> =>
  COMMAND_GROUPS.flatMap((group) =>
    commands.filter(
      (command) => command.group === group && (command.when?.(context) ?? true)
    )
  )

export const runCommand = (
  command: Command,
  context: CommandContext,
  env: CommandEnv
): void => {
  if ("page" in command) env.open(command.page)
  else command.run(context, env)
}
