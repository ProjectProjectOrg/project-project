import { useAtomValue } from "@effect/atom-react"
import {
  defaultMoveStatus,
  planTicketMove,
  type Member,
  type ProjectStatus,
  type StatusSlug,
  type TicketDetail
} from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"

import {
  project as projectDetail,
  projectRequest
} from "@/features/projects/atoms/projects"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { tagsFor, tagsRequest } from "@/features/tags/atoms/tags"
import { moveNotes } from "@/features/tickets/lib/moveNotes"
import { compareByOrderKey } from "@/lib/orderKey"

export type MoveDestination =
  | Readonly<{ state: "loading" | "failed" }>
  | Readonly<{
      state: "ready"
      statuses: ReadonlyArray<ProjectStatus>
      defaultStatus: StatusSlug | null
      notes: ReadonlyArray<string>
    }>

const NO_MEMBERS: ReadonlyArray<Member> = []

export function useMoveDestination(
  orgSlug: string,
  sourceSlug: string,
  ticket: TicketDetail,
  destination: string
): MoveDestination {
  const source = useAtomValue(
    projectDetail(projectRequest(orgSlug, sourceSlug))
  )
  const statusesResult = useAtomValue(
    statusesFor(statusesRequest(orgSlug, destination))
  )
  const tagsResult = useAtomValue(tagsFor(tagsRequest(orgSlug, destination)))
  const projectResult = useAtomValue(
    projectDetail(projectRequest(orgSlug, destination))
  )
  if (
    Result.isFailure(statusesResult) ||
    Result.isFailure(tagsResult) ||
    Result.isFailure(projectResult)
  ) {
    return { state: "failed" }
  }
  if (
    !Result.isSuccess(statusesResult) ||
    !Result.isSuccess(tagsResult) ||
    !Result.isSuccess(projectResult)
  ) {
    return { state: "loading" }
  }
  const statuses = statusesResult.value.toSorted(compareByOrderKey)
  const slugs = statuses.map((status) => status.slug)
  const plan = planTicketMove(ticket, {
    statuses: slugs,
    tags: tagsResult.value.map((tag) => tag.name),
    memberIds: new Set(projectResult.value.members.map((member) => member.id)),
    estimation: projectResult.value.estimation
  })
  const defaultSlug = defaultMoveStatus(ticket.status, slugs)
  return {
    state: "ready",
    statuses,
    defaultStatus:
      statuses.find((status) => status.slug === defaultSlug)?.slug ?? null,
    notes: moveNotes(
      ticket,
      plan.dropped,
      Result.isSuccess(source) ? source.value.members : NO_MEMBERS
    )
  }
}
