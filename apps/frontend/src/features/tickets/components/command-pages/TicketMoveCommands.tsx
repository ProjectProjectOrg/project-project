import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  isEpic,
  hasSubTickets,
  type Project,
  type TicketDetail
} from "@pp/shared"
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import { FolderInput } from "lucide-react"
import { useState, type ReactNode } from "react"

import { CommandMenuItem } from "@/components/ui/command-menu"
import { CommandFrame } from "@/features/command-menu/components/CommandFrame"
import type { TicketContext } from "@/features/command-menu/lib/commandMenu"
import {
  projectsFor,
  projectsRequest
} from "@/features/projects/atoms/projects"
import { ProjectIconDisplay } from "@/features/projects/components/ProjectIconDisplay"
import {
  moveTicket,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import { useMoveDestination } from "@/features/tickets/hooks/useMoveDestination"
import { statusMetaFor } from "@/features/tickets/lib/ticketMeta"
import { errorMessage } from "@/lib/errorMessage"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import type { TicketPageProps } from "./TicketFieldCommands"

const NO_PROJECTS: ReadonlyArray<Project> = []

export function TicketMovePage({
  ticket,
  context,
  chip,
  onBack,
  env
}: TicketPageProps) {
  const result = useAtomValue(projectsFor(projectsRequest(ticket.orgSlug)))
  const [destination, setDestination] = useState<string | null>(null)
  const projects = (Result.isSuccess(result) ? result.value : NO_PROJECTS)
    .filter((project) => project.slug !== ticket.slug)
    .toSorted((a, b) => a.name.localeCompare(b.name))
  const chosen = projects.find((project) => project.slug === destination)
  const epicHasTickets =
    isEpic(context.ticketDetail) && hasSubTickets(context.ticketDetail)

  if (chosen !== undefined && context.ticketDetail !== null) {
    return (
      <MoveStatusStep
        ticket={ticket}
        detail={context.ticketDetail}
        destination={chosen}
        chip={chip}
        onBack={() => setDestination(null)}
        onMoved={env.close}
      />
    )
  }

  return (
    <CommandFrame
      chip={chip}
      placeholder={m.tickets_command_move_project_placeholder()}
      onBack={onBack}
      notice={Result.isFailure(result) ? m.tickets_move_projects_error() : null}
      empty={
        epicHasTickets
          ? {
              icon: FolderInput,
              title: m.tickets_move_error_epic_has_tickets(),
              description: ""
            }
          : undefined
      }
      items={
        epicHasTickets
          ? []
          : projects.map((project) => ({
              value: project.slug,
              label: project.name,
              keywords: [project.key]
            }))
      }
      onSelect={(item) => setDestination(item.value)}
      renderItem={(item) => {
        const project = projects.find((entry) => entry.slug === item.value)
        if (project === undefined) return null
        return (
          <CommandMenuItem value={item.value}>
            <span
              aria-hidden
              className="inline-flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-[4px] text-body leading-none corner-squircle"
            >
              <ProjectIconDisplay
                orgSlug={ticket.orgSlug}
                icon={project.icon}
                iconImage={project.iconImage}
                size={16}
              />
            </span>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
          </CommandMenuItem>
        )
      }}
    />
  )
}

function MoveStatusStep({
  ticket,
  detail,
  destination,
  chip,
  onBack,
  onMoved
}: Readonly<{
  ticket: TicketContext
  detail: TicketDetail
  destination: Pick<Project, "slug" | "name">
  chip: ReactNode
  onBack: () => void
  onMoved: () => void
}>) {
  const move = useAtomSet(
    moveTicket(ticketRequest(ticket.orgSlug, ticket.slug, ticket.ticketId)),
    { mode: "promiseExit" }
  )
  const target = useMoveDestination(
    ticket.orgSlug,
    ticket.slug,
    detail,
    destination.slug
  )
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const statuses = target.state === "ready" ? target.statuses : []
  const defaultStatus = target.state === "ready" ? target.defaultStatus : null
  const ordered = [
    ...statuses.filter((status) => status.slug === defaultStatus),
    ...statuses.filter((status) => status.slug !== defaultStatus)
  ]
  const description =
    target.state === "ready" ? target.notes.join(" ") : undefined

  return (
    <CommandFrame
      chip={chip}
      placeholder={m.tickets_command_move_status_placeholder({
        project: destination.name
      })}
      description={description}
      onBack={onBack}
      notice={
        failure ??
        (target.state === "failed" ? m.tickets_move_destination_error() : null)
      }
      items={ordered.map((status) => ({
        value: status.slug,
        label: m.tickets_command_move_as_status({
          id: ticket.ticketId,
          status: statusMetaFor(status.slug, statuses).label
        })
      }))}
      onSelect={async (item) => {
        if (pending) return
        const status = statuses.find((entry) => entry.slug === item.value)
        if (status === undefined) return
        setPending(true)
        setFailure(null)
        const exit = await move({
          toProject: destination.slug,
          status: status.slug
        })
        setPending(false)
        if (Exit.isFailure(exit)) {
          setFailure(errorMessage(Cause.squash(exit.cause)))
          return
        }
        onMoved()
      }}
      renderItem={(item) => {
        const meta = statusMetaFor(item.value, statuses)
        const Icon = meta.icon
        return (
          <CommandMenuItem value={item.value}>
            <Icon
              className={cn("size-4 shrink-0", meta.className)}
              style={meta.color ? { color: meta.color } : undefined}
              strokeWidth={1.75}
            />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
          </CommandMenuItem>
        )
      }}
    />
  )
}
