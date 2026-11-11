import * as Schema from "effect/Schema"

import {
  rewriteTicketMentions,
  type TicketMentionTarget
} from "../comments/mentions"
import type { Estimate, EstimationMode } from "../estimates/Estimate"
import { Slug } from "../projects/Project"
import { TicketId, TicketStatus } from "./Ticket"

export const MoveTicketInput = Schema.Struct({
  toProject: Slug.annotate({
    description:
      "The slug of the project to move the ticket to, in the same organization (`list_projects`)."
  }),
  status: Schema.optional(TicketStatus).annotate({
    description:
      "A status slug of the destination project (`list_statuses` there). Omit to keep the current status when the destination has it, or its first status otherwise."
  })
})
export type MoveTicketInput = typeof MoveTicketInput.Type

export const MovedTicket = Schema.Struct({
  from: TicketId,
  to: TicketId
})
export type MovedTicket = typeof MovedTicket.Type

export const MoveTicketResult = Schema.Struct({
  projectSlug: Slug,
  id: TicketId,
  moved: Schema.Array(MovedTicket)
})
export type MoveTicketResult = typeof MoveTicketResult.Type

export const MovedTicketLocation = Schema.Struct({
  projectSlug: Slug,
  id: TicketId
})
export type MovedTicketLocation = typeof MovedTicketLocation.Type

export const formatMovedFrom = (projectSlug: string, ticketId: string) =>
  `${projectSlug}/${ticketId}`

export type MoveDestination = Readonly<{
  statuses: ReadonlyArray<string>
  tags: ReadonlyArray<string>
  memberIds: ReadonlySet<string>
  estimation: EstimationMode
}>

export type MovableTicket = Readonly<{
  status: string
  tags: ReadonlyArray<string>
  assignees: ReadonlyArray<string>
  estimate?: Estimate | null
}>

export type TicketMovePlan<T extends MovableTicket> = Readonly<{
  status: string | null
  tags: ReadonlyArray<T["tags"][number]>
  assignees: ReadonlyArray<string>
  keepsEstimate: boolean
  dropped: Readonly<{
    tags: ReadonlyArray<T["tags"][number]>
    assignees: ReadonlyArray<string>
    estimate: boolean
  }>
}>

export const defaultMoveStatus = (
  current: string,
  statuses: ReadonlyArray<string>
): string | null =>
  statuses.includes(current) ? current : (statuses[0] ?? null)

export const planTicketMove = <T extends MovableTicket>(
  ticket: T,
  destination: MoveDestination,
  requestedStatus?: string
): TicketMovePlan<T> => {
  const knownTags = new Set(destination.tags)
  const hasEstimate = ticket.estimate !== undefined && ticket.estimate !== null
  const keepsEstimate =
    hasEstimate && ticket.estimate?.unit === destination.estimation
  return {
    status:
      requestedStatus ?? defaultMoveStatus(ticket.status, destination.statuses),
    tags: ticket.tags.filter((tag) => knownTags.has(tag)),
    assignees: ticket.assignees.filter((id) => destination.memberIds.has(id)),
    keepsEstimate,
    dropped: {
      tags: ticket.tags.filter((tag) => !knownTags.has(tag)),
      assignees: ticket.assignees.filter(
        (id) => !destination.memberIds.has(id)
      ),
      estimate: hasEstimate && !keepsEstimate
    }
  }
}

export type MoveMentionContext = Readonly<{
  fromProject: string
  toProject: string
  moved: ReadonlyMap<string, string>
}>

const afterMove = (
  target: TicketMentionTarget,
  context: MoveMentionContext,
  writtenIn: string
): TicketMentionTarget => {
  const project = target.projectSlug ?? writtenIn
  const movedTo =
    project === context.fromProject
      ? context.moved.get(target.ticketId)
      : undefined
  return movedTo === undefined
    ? { projectSlug: project, ticketId: target.ticketId }
    : { projectSlug: context.toProject, ticketId: movedTo }
}

const relativeTo = (
  target: TicketMentionTarget,
  projectSlug: string
): TicketMentionTarget =>
  target.projectSlug === projectSlug ? { ...target, projectSlug: null } : target

export const rewriteMentionsInMovedTicket = (
  text: string,
  context: MoveMentionContext
): string =>
  rewriteTicketMentions(text, (target) =>
    relativeTo(
      afterMove(target, context, context.fromProject),
      context.toProject
    )
  )

export const rewriteMentionsOfMovedTickets = (
  text: string,
  context: MoveMentionContext,
  writtenIn: string
): string =>
  rewriteTicketMentions(text, (target) => {
    const project = target.projectSlug ?? writtenIn
    return project === context.fromProject && context.moved.has(target.ticketId)
      ? relativeTo(afterMove(target, context, writtenIn), writtenIn)
      : null
  })
