import { m } from "@/paraglide/messages"

import { Command, type CommandContext, type CommandGroup } from "./commands"

const GROUP_LABELS: Readonly<Record<CommandGroup, () => string>> = {
  ticket: m.tickets_command_group,
  ticketRelations: m.tickets_command_group_relations,
  ticketGit: m.tickets_command_group_git,
  ticketActions: m.tickets_command_group_actions,
  sprint: m.sprints_command_group,
  backlog: m.sprints_command_group_backlog,
  view: m.chrome_command_menu_group_view,
  create: m.chrome_command_menu_group_create,
  setup: m.chrome_command_menu_group_setup,
  navigation: m.chrome_command_menu_group_navigation,
  miscellaneous: m.chrome_command_menu_group_miscellaneous,
  settings: m.chrome_command_menu_group_settings,
  account: m.chrome_command_menu_group_account
}

export const commandItem = (command: Command, context: CommandContext) => ({
  value: command.id,
  label: command.label(context),
  icon: command.icon,
  group: GROUP_LABELS[command.group](),
  keywords: command.keywords,
  parent: command.parent?.(context),
  aside: command.aside?.(context),
  searchOnly: command.listed === "search",
  shortcut: command.hotkey?.hotkey ?? undefined,
  enterLabel: Command.$is("page")(command)
    ? m.chrome_command_menu_select()
    : m.chrome_command_menu_run()
})
