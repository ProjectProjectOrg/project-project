import { feedbackCommands } from "@/features/feedback/commands"
import { gitCommands } from "@/features/github/commands"
import { organizationCommands } from "@/features/organizations/commands"
import { projectCommands } from "@/features/projects/commands"
import { sprintCommands } from "@/features/sprints/commands"
import { ticketCommands } from "@/features/tickets/commands"
import { relationCommands } from "@/features/tickets/relationCommands"

import { appCommands } from "./appCommands"
import type { Command } from "./lib/commands"
import { settingsCommands } from "./settingsCommands"

export const commandRegistry: ReadonlyArray<Command> = [
  ...ticketCommands,
  ...relationCommands,
  ...gitCommands,
  ...sprintCommands,
  ...projectCommands,
  ...organizationCommands,
  ...settingsCommands,
  ...feedbackCommands,
  ...appCommands
]
