import { useAtomValue } from "@effect/atom-react"
import * as Result from "effect/reactivity/AsyncResult"
import { FolderKanban } from "lucide-react"
import { useState } from "react"

import {
  projectsFor,
  projectsRequest
} from "@/features/projects/atoms/projects"
import {
  ticketItem,
  useTicketCommandSearch
} from "@/features/tickets/hooks/useTicketCommandSearch"
import { m } from "@/paraglide/messages"

import type { CommandPageProps } from "../lib/commandPages"
import {
  runCommand,
  visibleCommands,
  type Command,
  type CommandGroup
} from "../lib/commands"
import { CommandFrame, type CommandFrameItem } from "./CommandFrame"

const GROUP_LABELS: Readonly<Record<CommandGroup, () => string>> = {
  ticket: m.tickets_command_group,
  view: m.chrome_command_menu_group_view,
  create: m.chrome_command_menu_group_create,
  navigation: m.chrome_command_menu_group_navigation,
  miscellaneous: m.chrome_command_menu_group_miscellaneous,
  settings: m.chrome_command_menu_group_settings,
  account: m.chrome_command_menu_group_account
}

const TICKET_VALUE = "open-ticket:"
const PROJECT_VALUE = "open-project:"

function useProjectSearchTargets(orgSlug: string) {
  const result = useAtomValue(projectsFor(projectsRequest(orgSlug)))
  return Result.isSuccess(result) ? result.value : []
}

export function RootCommands({
  context,
  chip,
  onBack,
  env,
  commands
}: CommandPageProps & Readonly<{ commands: ReadonlyArray<Command> }>) {
  const [search, setSearch] = useState("")
  const { recent, found } = useTicketCommandSearch(context, search)
  const projects = useProjectSearchTargets(context.orgSlug)
  const tickets = [...recent, ...found]
  const targets = new Map<string, string>([
    ...tickets.map(
      (target) =>
        [
          `${TICKET_VALUE}${target.id}`,
          `/orgs/${context.orgSlug}/projects/${target.projectSlug}/tickets/${target.id}`
        ] as const
    ),
    ...projects.map(
      (project) =>
        [
          `${PROJECT_VALUE}${project.slug}`,
          `/orgs/${context.orgSlug}/projects/${project.slug}`
        ] as const
    )
  ])
  const visible = visibleCommands(commands, context)
  const byId = new Map(visible.map((command) => [command.id, command]))
  const items: ReadonlyArray<CommandFrameItem> = [
    ...visible.map((command) => ({
      value: command.id,
      label: command.label(),
      icon: command.icon,
      group: GROUP_LABELS[command.group](),
      keywords: command.keywords,
      parent: command.parent?.(),
      searchOnly: command.searchOnly
    })),
    ...projects.map((project) => ({
      value: `${PROJECT_VALUE}${project.slug}`,
      label: project.name,
      icon: FolderKanban,
      group: m.chrome_command_menu_group_projects(),
      searchOnly: true
    })),
    ...tickets.map((target) =>
      ticketItem(target, m.tickets_command_group_results(), {
        valuePrefix: TICKET_VALUE,
        inSearch: true
      })
    )
  ]
  return (
    <CommandFrame
      chip={chip}
      placeholder={m.chrome_command_menu_placeholder()}
      onBack={onBack}
      items={items}
      onSearchChange={setSearch}
      onSelect={(item) => {
        const to = targets.get(item.value)
        if (to !== undefined) {
          env.navigate(to)
          env.close()
          return
        }
        const command = byId.get(item.value)
        if (command !== undefined) runCommand(command, context, env)
      }}
    />
  )
}
