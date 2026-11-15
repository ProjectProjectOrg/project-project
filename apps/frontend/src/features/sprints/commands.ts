import { Timer } from "lucide-react"

import type { Command } from "@/features/command-menu/lib/commands"
import { newSprintRequest } from "@/features/sprints/atoms/createSprint"
import { m } from "@/paraglide/messages"

export const sprintCommands: ReadonlyArray<Command> = [
  {
    id: "sprint.create",
    group: "create",
    label: m.sprints_command_create,
    icon: Timer,
    keywords: ["new", "add", "iteration", "cycle"],
    tool: "create_sprint",
    when: ({ tickets }) => tickets.planSprints,
    run: ({ orgSlug, projectSlug }, env) => {
      env.registry.set(newSprintRequest, { orgSlug, projectSlug })
      env.open("createSprint")
    }
  }
]
