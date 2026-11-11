import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Project, StatusSlug, TicketDetail, TicketId } from "@pp/shared"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Select, SelectTrigger } from "@/components/ui/select"
import {
  projectsFor,
  projectsRequest
} from "@/features/projects/atoms/projects"
import { ProjectIconDisplay } from "@/features/projects/components/ProjectIconDisplay"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { StatusOption } from "@/features/statuses/components/StatusOption"
import {
  moveTicket,
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import { useMoveDestination } from "@/features/tickets/hooks/useMoveDestination"
import { mutationErrorText } from "@/lib/mutationError"
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
  const { orgSlug, slug } = useProjectRoute()
  const target = useMoveDestination(orgSlug, slug, ticket, destination)
  if (target.state !== "ready") {
    return target.state === "failed" ? (
      <p className="text-caption text-destructive">
        {m.tickets_move_destination_error()}
      </p>
    ) : (
      <div className="h-8 animate-pulse rounded-md bg-muted" />
    )
  }
  const { statuses, notes } = target
  const selectedStatus = status ?? target.defaultStatus

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
