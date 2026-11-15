import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { isEpicType } from "@pp/shared"
import { CommandMenuItem } from "@pp/ui/command-menu"
import { useNavigate } from "@tanstack/react-router"
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import { Plus } from "lucide-react"
import { useState } from "react"

import { fireMutation } from "@/api/viewMutation"
import { CommandFrame } from "@/features/command-menu/components/CommandFrame"
import type { CommandPageProps } from "@/features/command-menu/lib/commandPages"
import {
  projectsFor,
  projectsRequest
} from "@/features/projects/atoms/projects"
import {
  assignTicketToSprint,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import {
  createTicketInProject,
  newTicketRequest,
  relatedPayload
} from "@/features/tickets/atoms/createTicket"
import {
  markTicket,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import { useCreatorType } from "@/features/tickets/hooks/useCreatorType"
import { errorMessage } from "@/lib/errorMessage"
import { m } from "@/paraglide/messages"

// "New ticket" from cmd+k: type the title, pick the action, and the new
// ticket opens with its description focused. A command that creates in a
// sprint or relative to a ticket leaves that in newTicketRequest first. With
// no project in view, there is one action per project.
export function CreateTicketPage({
  context,
  chip,
  onBack,
  env
}: CommandPageProps) {
  const request = useAtomValue(newTicketRequest)
  const orgSlug = request?.orgSlug ?? context.orgSlug
  const projectSlug = request?.projectSlug ?? context.projectSlug
  const related = request?.related ?? null
  const projectsResult = useAtomValue(projectsFor(projectsRequest(orgSlug)))
  const projects = Result.isSuccess(projectsResult) ? projectsResult.value : []
  const creatorType = useCreatorType({
    orgSlug,
    slug: projectSlug ?? "",
    epics: related?.kind !== "subTicket"
  })
  const create = useAtomSet(createTicketInProject, { mode: "promiseExit" })
  const navigate = useNavigate()
  const [title, setTitle] = useState(request?.title ?? "")
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const trimmed = title.trim()

  const items =
    trimmed === ""
      ? []
      : projectSlug !== null
        ? [
            {
              value: projectSlug,
              label: m.tickets_command_create_named({ title: trimmed }),
              icon: Plus
            }
          ]
        : projects.map((project) => ({
            value: project.slug,
            label: m.tickets_command_create_named_in({
              title: trimmed,
              project: project.name
            }),
            icon: Plus
          }))

  const createIn = async (slug: string) => {
    if (pending || trimmed === "") return
    setPending(true)
    setFailure(null)
    const inContext = slug === projectSlug
    const exit = await create({
      orgSlug,
      slug,
      payload: {
        title: trimmed,
        ...(inContext ? creatorType.payload : {}),
        ...relatedPayload(inContext ? related : null)
      }
    })
    if (inContext) creatorType.settle(exit)
    if (Exit.isFailure(exit)) {
      setPending(false)
      setFailure(errorMessage(Cause.squash(exit.cause)))
      return
    }
    const id = exit.value.id
    if (inContext && related?.kind === "blockedBy") {
      const marked = await fireMutation(
        env.registry,
        markTicket(ticketRequest(orgSlug, slug, related.ticketId)),
        { kind: "blockedBy", target: id }
      )
      if (Result.isFailure(marked)) {
        setPending(false)
        setFailure(errorMessage(Cause.squash(marked.cause)))
        return
      }
    }
    if (
      inContext &&
      request?.sprint !== undefined &&
      !isEpicType(creatorType.type)
    ) {
      assignTicketToSprint(
        env.registry,
        sprintListRequest(orgSlug, slug),
        id,
        request.sprint
      )
    }
    env.registry.set(newTicketRequest, null)
    env.close()
    void navigate({
      to: "/orgs/$orgSlug/projects/$slug/tickets/$id",
      params: { orgSlug, slug, id },
      search: { focusBody: "1" }
    })
  }

  return (
    <CommandFrame
      chip={chip}
      placeholder={m.tickets_create_dialog_title_placeholder()}
      onBack={onBack}
      filter={false}
      initialSearch={request?.title ?? ""}
      notice={failure}
      onSearchChange={(value) => {
        setFailure(null)
        setTitle(value)
      }}
      items={items}
      renderItem={(item) => (
        <CommandMenuItem value={item.value}>
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
        </CommandMenuItem>
      )}
      onSelect={(item) => void createIn(item.value)}
    />
  )
}
