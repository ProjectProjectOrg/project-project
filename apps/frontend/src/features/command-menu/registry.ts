import { organizationCommands } from "@/features/organizations/commands"
import { projectCommands } from "@/features/projects/commands"
import { ticketCommands } from "@/features/tickets/commands"

import { appCommands } from "./appCommands"
import type { Command } from "./lib/commands"
import { settingsCommands } from "./settingsCommands"

export const commandRegistry: ReadonlyArray<Command> = [
  ...ticketCommands,
  ...projectCommands,
  ...organizationCommands,
  ...settingsCommands,
  ...appCommands
]
