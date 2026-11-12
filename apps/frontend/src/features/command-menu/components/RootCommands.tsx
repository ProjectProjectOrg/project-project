import { useAtomValue } from "@effect/atom-react"
import { TicketId } from "@pp/shared"
import { useParams } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import * as Schema from "effect/Schema"
import { FolderKanban, Plus, Search } from "lucide-react"
import { useState } from "react"

import {
  projectsFor,
  projectsRequest
} from "@/features/projects/atoms/projects"
import { createTicketDialog } from "@/features/tickets/atoms/createTicketDialog"
import {
  TicketPeek,
  TicketPrefetch
} from "@/features/tickets/components/TicketPeek"
import { useTicketCommandSearch } from "@/features/tickets/hooks/useTicketCommandSearch"
import {
  SEARCHING_RANK,
  ticketCommandValue,
  ticketItem,
  type TicketTarget
} from "@/features/tickets/lib/ticketCommandTargets"
import { m } from "@/paraglide/messages"

import type { CommandPageProps } from "../lib/commandPages"
import {
  runCommand,
  visibleCommands,
  type Command,
  type CommandContext,
  type CommandGroup
} from "../lib/commands"
import { CommandFrame, type CommandFrameItem } from "./CommandFrame"

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

export const commandItem = (
  command: Command,
  context: CommandContext
): CommandFrameItem => ({
  value: command.id,
  label: command.label(context),
  icon: command.icon,
  group: GROUP_LABELS[command.group](),
  keywords: command.keywords,
  parent: command.parent?.(),
  aside: command.aside?.(context),
  searchOnly: command.searchOnly,
  enterLabel:
    "page" in command
      ? m.chrome_command_menu_select()
      : m.chrome_command_menu_run()
})

const PROJECT_VALUE = "open-project:"
const SEARCHING_VALUE = "searching-tickets"
const isTicketId = Schema.is(TicketId)
const PREFETCH_AROUND = 2

function useProjectSearchTargets(orgSlug: string, current: string | null) {
  const result = useAtomValue(projectsFor(projectsRequest(orgSlug)))
  return Result.isSuccess(result)
    ? result.value.filter((project) => project.slug !== current)
    : []
}

const isContextTicket = (
  self: CommandContext["ticket"],
  target: TicketTarget
) =>
  self !== null &&
  target.id === self.ticketId &&
  target.projectSlug === self.slug

function useSprintToCreateIn(sprint: CommandContext["sprint"]) {
  const params = useParams({ strict: false })
  return sprint !== null &&
    sprint.sprint.completedAt === null &&
    params.groupId === sprint.sprint.id
    ? sprint.sprint.id
    : undefined
}

function useIsOnTicketPage(self: CommandContext["ticket"]) {
  const params = useParams({ strict: false })
  return (
    self !== null && params.id === self.ticketId && params.slug === self.slug
  )
}

export function TicketSearchCommands(props: CommandPageProps) {
  return (
    <RootCommands
      {...props}
      chip={null}
      scope="tickets"
      commands={[]}
      initialSearch=""
      initialFocus={null}
    />
  )
}

export function RootCommands({
  context,
  chip,
  onBack,
  env,
  scope = "everything",
  commands,
  initialSearch,
  initialFocus
}: CommandPageProps &
  Readonly<{
    scope?: "everything" | "tickets"
    commands: ReadonlyArray<Command>
    initialSearch: string
    initialFocus: string | null
  }>) {
  const [search, setSearch] = useState(initialSearch)
  const { recent, found, searching } = useTicketCommandSearch(context, search)
  const projectTargets = useProjectSearchTargets(
    context.orgSlug,
    context.projectSlug
  )
  const projects = scope === "tickets" ? [] : projectTargets
  const self = context.ticket
  const onOwnPage = useIsOnTicketPage(self)
  const createIn = useSprintToCreateIn(context.sprint)
  const tickets = [...recent, ...found].filter(
    (target) => !(onOwnPage && isContextTicket(self, target))
  )
  const ticketsByValue = new Map(
    tickets.map((target) => [ticketCommandValue(target), target])
  )
  const targets = new Map<string, string>([
    ...tickets.map(
      (target) =>
        [
          ticketCommandValue(target),
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
    ...visible.map((command) => commandItem(command, context)),
    ...projects.map((project) => ({
      value: `${PROJECT_VALUE}${project.slug}`,
      label: project.name,
      icon: FolderKanban,
      group: m.chrome_command_menu_group_projects(),
      searchOnly: true,
      enterLabel: m.chrome_command_menu_open_project()
    })),
    ...tickets.map((target) => ({
      ...ticketItem(
        target,
        scope === "tickets" && recent.includes(target)
          ? m.tickets_command_group_recent()
          : m.tickets_command_group_results(),
        { inSearch: true }
      ),
      searchOnly: scope === "everything",
      actionable: !isContextTicket(self, target),
      enterLabel: m.chrome_command_menu_open_ticket()
    })),
    ...(searching && tickets.length === 0
      ? [
          {
            value: SEARCHING_VALUE,
            label: m.tickets_command_searching(),
            icon: Search,
            group: m.tickets_command_group_results(),
            searchOnly: true,
            prefiltered: true,
            rank: SEARCHING_RANK,
            disabled: true
          }
        ]
      : [])
  ]
  return (
    <CommandFrame
      chip={chip}
      placeholder={
        scope === "tickets"
          ? m.tickets_search_placeholder()
          : m.chrome_command_menu_placeholder()
      }
      onBack={onBack}
      items={items}
      initialSearch={initialSearch}
      empty={
        search.trim() !== "" &&
        context.projectSlug !== null &&
        context.tickets.create
          ? {
              icon: Search,
              title: m.chrome_command_menu_empty_title({
                query: search.trim()
              }),
              description: m.tickets_command_create_from_search_body(),
              action: {
                label: m.tickets_command_create_from_search({
                  title: search.trim()
                }),
                icon: Plus,
                run: () => {
                  env.close()
                  env.registry.set(createTicketDialog, {
                    orgSlug: context.orgSlug,
                    projectSlug: context.projectSlug,
                    title: search.trim(),
                    sprint: createIn
                  })
                }
              }
            }
          : undefined
      }
      initialFocus={initialFocus}
      searchFooter={scope === "tickets" ? "always" : "whenSearching"}
      fixedHeight
      renderPeek={(value) => {
        const target = ticketsByValue.get(value)
        if (target === undefined || !isTicketId(target.id)) return null
        const index = tickets.indexOf(target)
        return (
          <TicketPeek
            ticketId={target.id}
            prefetch={tickets
              .slice(
                Math.max(0, index - PREFETCH_AROUND),
                index + PREFETCH_AROUND + 1
              )
              .flatMap((ticket) =>
                ticket !== target &&
                ticket.projectSlug === target.projectSlug &&
                isTicketId(ticket.id)
                  ? [ticket.id]
                  : []
              )}
            scope={{
              orgSlug: context.orgSlug,
              slug: target.projectSlug,
              members: context.project?.members ?? []
            }}
          />
        )
      }}
      warmPeek={(value) => {
        const target = ticketsByValue.get(value)
        return target === undefined || !isTicketId(target.id) ? null : (
          <TicketPrefetch
            ticketId={target.id}
            scope={{ orgSlug: context.orgSlug, slug: target.projectSlug }}
          />
        )
      }}
      onSearchChange={setSearch}
      onActOn={(item) => {
        const target = ticketsByValue.get(item.value)
        if (target === undefined || !isTicketId(target.id)) return false
        if (isContextTicket(self, target)) return false
        env.actOn(
          {
            orgSlug: context.orgSlug,
            slug: target.projectSlug,
            ticketId: target.id
          },
          { search, value: item.value }
        )
        return true
      }}
      onSelect={(item) => {
        const to = targets.get(item.value)
        if (to !== undefined) {
          env.navigate(to)
          env.close()
          return
        }
        const command = byId.get(item.value)
        if (command === undefined) return
        runCommand(command, context, {
          ...env,
          open: (page) => env.open(page, { search, value: item.value })
        })
      }}
    />
  )
}
