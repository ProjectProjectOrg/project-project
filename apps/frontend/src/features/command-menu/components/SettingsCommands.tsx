import { commandItem } from "@/features/command-menu/lib/commandItem"
import { useIntegrationCommands } from "@/features/integrations/hooks/useIntegrationCommands"
import { m } from "@/paraglide/messages"

import type { CommandPageProps } from "../lib/commandPages"
import { runCommand, visibleCommands, type Command } from "../lib/commands"
import {
  orgScopeName,
  projectScopeName,
  settingsCommands
} from "../settingsCommands"
import { CommandFrame, type CommandFrameItem } from "./CommandFrame"

const isIntegration = (command: Command) => command.id.includes(".integration.")

// The settings tree as a page: the project's sections, then the org's, then
// the profile's, each under its name. Integrations and connected accounts
// show while searching, under the page that holds them.
export function SettingsCommands({
  context,
  chip,
  onBack,
  env
}: CommandPageProps) {
  const integrations = useIntegrationCommands(context)
  const sections = settingsCommands.filter(
    (command) => command.id !== "settings.search"
  )
  const lastOrg = sections.findLastIndex((command) =>
    command.id.startsWith("settings.org.")
  )
  const ofOrg = (command: Command) => command.id.startsWith("settings.org.")
  const commands = visibleCommands(
    [
      ...sections.toSpliced(lastOrg + 1, 0, ...integrations.filter(ofOrg)),
      ...integrations.filter((command) => !ofOrg(command))
    ],
    context
  )
  const scopeOf = (command: Command) =>
    command.id.startsWith("settings.project.")
      ? projectScopeName(context)
      : command.id.startsWith("settings.org.")
        ? orgScopeName(context)
        : m.chrome_command_menu_settings_group_profile()
  const items = commands.map(
    (command) =>
      ({
        ...commandItem(command, context),
        group: scopeOf(command),
        parent: !isIntegration(command)
          ? undefined
          : command.id.startsWith("settings.org.")
            ? [m.org_settings_integrations_tab()]
            : [m.profile_section_connections_title()],
        searchOnly: isIntegration(command)
      }) satisfies CommandFrameItem
  )
  return (
    <CommandFrame
      chip={chip}
      placeholder={m.chrome_command_menu_settings_placeholder()}
      onBack={onBack}
      items={items}
      onSelect={(item) => {
        const command = commands.find(
          (candidate) => candidate.id === item.value
        )
        if (command) runCommand(command, context, env)
      }}
    />
  )
}
