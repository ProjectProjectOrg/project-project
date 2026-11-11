import { ArrowRight } from "lucide-react"

import { CommandFrame } from "@/features/command-menu/components/CommandFrame"
import { commandItem } from "@/features/command-menu/components/RootCommands"
import {
  runCommand,
  visibleCommands
} from "@/features/command-menu/lib/commands"
import { m } from "@/paraglide/messages"

import { SprintContextChip, type SprintPageProps } from "./SprintCommandPages"
import { goTo, sprintPath, useSprintActions } from "./SprintCommandScopes"

export function SprintPlanPage({
  context,
  sprint,
  onBack,
  env
}: SprintPageProps) {
  const actions = useSprintActions(sprint)
  const commands = visibleCommands(
    [
      ...actions,
      goTo(
        "sprint.open",
        () => m.sprints_command_open({ name: sprint.sprint.name }),
        ArrowRight,
        sprintPath(sprint.orgSlug, sprint.slug, sprint.sprint)
      )
    ],
    context
  )
  return (
    <CommandFrame
      chip={<SprintContextChip sprint={sprint} />}
      placeholder={m.sprints_plan_placeholder({ name: sprint.sprint.name })}
      onBack={onBack}
      items={commands.map((command) => commandItem(command, context))}
      onSelect={(item) => {
        const command = commands.find((entry) => entry.id === item.value)
        if (command === undefined) return
        runCommand(command, context, {
          ...env,
          open: (page) => env.open(page, { search: "", value: item.value })
        })
      }}
    />
  )
}
