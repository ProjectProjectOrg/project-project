import { Timer } from "lucide-react"

import type { Command } from "@/features/command-menu/lib/commands"
import { createSprintDialog } from "@/features/sprints/atoms/createSprintDialog"
import { m } from "@/paraglide/messages"

export const sprintCommands: ReadonlyArray<Command> = [
  {
    id: "sprint.create",
    group: "create",
    label: m.sprints_command_create,
    icon: Timer,
    keywords: ["new", "add", "iteration", "cycle"],
    tool: "create_sprint",
    when: ({ canPlanSprints }) => canPlanSprints,
    run: ({ orgSlug, projectSlug }, env) => {
      env.close()
      env.registry.set(createSprintDialog, { orgSlug, projectSlug })
    }
  }
]
