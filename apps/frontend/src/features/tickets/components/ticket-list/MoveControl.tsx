import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  defaultMoveStatus,
  planTicketMove,
  type Member,
  type Project,
  type StatusSlug,
  type TicketDetail,
  type TicketId
} from "@pp/shared"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Select, SelectTrigger } from "@/components/ui/select"
import {
  project as projectDetail,
  projectRequest,
  projectsFor,
  projectsRequest
} from "@/features/projects/atoms/projects"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { ProjectIconDisplay } from "@/features/projects/components/ProjectIconDisplay"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { StatusOption } from "@/features/statuses/components/StatusOption"
import { tagsFor, tagsRequest } from "@/features/tags/atoms/tags"
import {
  moveTicket,
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import { mutationErrorText } from "@/lib/mutationError"
import { compareByOrderKey } from "@/lib/orderKey"
import { m } from "@/paraglide/messages"

export function MoveTicketForm({
  id,
  onClose
}: Readonly<{
  id: TicketId
  onClose: () => void
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const req = ticketRequest(orgSlug, slug, id)
  const move = useAtomSet(moveTicket(req), { mode: "promiseExit" })
  const moveState = useAtomValue(moveTicket(req))
  const ticketResult = useAtomValue(ticketDetail(req))
  const projectsResult = useAtomValue(projectsFor(projectsRequest(orgSlug)))
  const [destination, setDestination] = useState<string | null>(null)
  const [status, setStatus] = useState<StatusSlug | null>(null)

  const destinations = Result.isSuccess(projectsResult)
    ? projectsResult.value.filter((project) => project.slug !== slug)
    : []
  const selected = destinations.find((project) => project.slug === destination)
  const error = mutationErrorText(moveState)

  const submit = async () => {
    if (selected === undefined) return
    const exit = await move({
      toProject: selected.slug,
      status: status ?? undefined
    })
    if (Exit.isSuccess(exit)) onClose()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="text-body font-semibold">{m.tickets_move_title()}</p>
        <p className="text-caption text-muted-foreground">
          {m.tickets_move_description()}
        </p>
      </div>
      {Result.isInitial(projectsResult) ? (
        <div className="h-8 animate-pulse rounded-md bg-muted" />
      ) : Result.isFailure(projectsResult) ? (
        <p className="text-caption text-destructive">
          {m.tickets_move_projects_error()}
        </p>
      ) : destinations.length === 0 ? (
        <p className="text-caption text-muted-foreground">
          {m.tickets_move_no_projects()}
        </p>
      ) : (
        <label className="flex flex-col gap-1.5">
          <span className="text-caption text-muted-foreground">
            {m.tickets_move_project_label()}
          </span>
          <Select
            value={destination}
            onValueChange={(next) => {
              setDestination(next)
              setStatus(null)
            }}
            items={destinations.map((project) => ({
              value: project.slug,
              textValue: project.name,
              label: <ProjectOption orgSlug={orgSlug} project={project} />
            }))}
          >
            <SelectTrigger
              placeholder={m.tickets_move_project_placeholder()}
              selectedLabel={
                selected === undefined ? undefined : (
                  <ProjectOption orgSlug={orgSlug} project={selected} />
                )
              }
              aria-label={m.tickets_move_project_label()}
            />
          </Select>
        </label>
      )}
      {selected !== undefined && Result.isSuccess(ticketResult) && (
        <MoveDestinationFields
          key={selected.slug}
          ticket={ticketResult.value}
          destination={selected.slug}
          status={status}
          onStatusChange={setStatus}
        />
      )}
      {error !== null && (
        <p className="text-caption text-destructive">{error}</p>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          {m.tickets_move_cancel()}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={selected === undefined || moveState.waiting}
          onClick={() => void submit()}
        >
          {m.tickets_move_submit()}
        </Button>
      </div>
    </div>
  )
}

function ProjectOption({
  orgSlug,
  project
}: Readonly<{
  orgSlug: string
  project: Pick<Project, "name" | "icon" | "iconImage">
}>) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span
        aria-hidden
        className="inline-flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-[4px] text-body leading-none corner-squircle"
      >
        <ProjectIconDisplay
          orgSlug={orgSlug}
          icon={project.icon}
          iconImage={project.iconImage}
          size={16}
        />
      </span>
      <span className="truncate">{project.name}</span>
    </span>
  )
}

const EMPTY_MEMBERS: ReadonlyArray<Member> = []

function MoveDestinationFields({
  ticket,
  destination,
  status,
  onStatusChange
}: Readonly<{
  ticket: TicketDetail
  destination: string
  status: StatusSlug | null
  onStatusChange: (status: StatusSlug) => void
}>) {
  const { orgSlug, projectReq } = useProjectRoute()
  const sourceResult = useAtomValue(projectDetail(projectReq))
  const sourceMembers = Result.isSuccess(sourceResult)
    ? sourceResult.value.members
    : EMPTY_MEMBERS
  const statusesResult = useAtomValue(
    statusesFor(statusesRequest(orgSlug, destination))
  )
  const tagsResult = useAtomValue(tagsFor(tagsRequest(orgSlug, destination)))
  const projectResult = useAtomValue(
    projectDetail(projectRequest(orgSlug, destination))
  )
  if (
    !Result.isSuccess(statusesResult) ||
    !Result.isSuccess(tagsResult) ||
    !Result.isSuccess(projectResult)
  ) {
    return Result.isFailure(statusesResult) ||
      Result.isFailure(tagsResult) ||
      Result.isFailure(projectResult) ? (
      <p className="text-caption text-destructive">
        {m.tickets_move_destination_error()}
      </p>
    ) : (
      <div className="h-8 animate-pulse rounded-md bg-muted" />
    )
  }

  const statuses = statusesResult.value.toSorted(compareByOrderKey)
  const plan = planTicketMove(ticket, {
    statuses: statuses.map((item) => item.slug),
    tags: tagsResult.value.map((tag) => tag.name),
    memberIds: new Set(projectResult.value.members.map((member) => member.id)),
    estimation: projectResult.value.estimation
  })
  const selectedStatus =
    status ??
    statuses.find(
      (item) =>
        item.slug ===
        defaultMoveStatus(
          ticket.status,
          statuses.map((entry) => entry.slug)
        )
    )?.slug ??
    null
  const droppedAssignees = plan.dropped.assignees.map(
    (id) => sourceMembers.find((member) => member.id === id)?.name ?? id
  )
  const notes = [
    plan.dropped.tags.length > 0
      ? m.tickets_move_drops_tags({ tags: plan.dropped.tags.join(", ") })
      : null,
    droppedAssignees.length > 0
      ? m.tickets_move_drops_assignees({ names: droppedAssignees.join(", ") })
      : null,
    plan.dropped.estimate ? m.tickets_move_drops_estimate() : null,
    ticket.branch !== null ? m.tickets_move_branch_note() : null,
    (ticket.subTicketCount ?? 0) > 0
      ? m.tickets_move_sub_tickets_note({ count: ticket.subTicketCount ?? 0 })
      : null,
    m.tickets_move_groups_note()
  ].filter((note) => note !== null)

  return (
    <>
      <label className="flex flex-col gap-1.5">
        <span className="text-caption text-muted-foreground">
          {m.tickets_move_status_label()}
        </span>
        <Select
          value={selectedStatus}
          onValueChange={onStatusChange}
          items={statuses.map((item) => ({
            value: item.slug,
            textValue: item.label,
            label: <StatusOption slug={item.slug} statuses={statuses} />
          }))}
        >
          <SelectTrigger
            selectedLabel={
              selectedStatus === null ? undefined : (
                <StatusOption slug={selectedStatus} statuses={statuses} />
              )
            }
            aria-label={m.tickets_move_status_label()}
          />
        </Select>
      </label>
      <ul className="flex flex-col gap-1 text-caption text-muted-foreground">
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </>
  )
}
