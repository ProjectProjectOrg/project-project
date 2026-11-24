import {
  finishedStatusSlugs,
  type BulkDeleteTicketsInput,
  type LinkedTicket,
  type TicketId
} from "@pp/shared"
import type * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import type { AtomRegistry } from "effect/reactivity/AtomRegistry"

import { Keys, projectScope } from "@/api/keys"
import {
  fireMutation,
  keepPredicted,
  viewMutation,
  type OptimisticView
} from "@/api/viewMutation"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"

import type { AddRelation } from "../lib/relationGroups"
import type { TicketPrediction } from "../lib/ticketPatch"
import type { BulkTicketsRequest } from "./bulkTickets"
import { removeFromView } from "./removeTickets"

type RowRelation = AddRelation & Readonly<{ source: LinkedTicket }>
export type MarkRowRelation = (
  registry: AtomRegistry,
  relation: RowRelation
) => Promise<Exit.Exit<unknown, unknown>>

const fields = {
  blockedBy: ["openBlockerCount", "openBlockingCount"],
  blocking: ["openBlockingCount", "openBlockerCount"],
  related: ["relatedCount", "relatedCount"]
} as const

const markRelationInView = <V, E>(
  view: OptimisticView<V, E>,
  path: BulkTicketsRequest,
  patch: (value: V, id: TicketId, change: TicketPrediction) => V
) =>
  ((registry, relation) => {
    const statuses = registry.get(
      statusesFor(statusesRequest(path.orgSlug, path.slug))
    )
    const finished = finishedStatusSlugs(Result.getOrElse(statuses, () => []))
    const scope = projectScope(path.orgSlug, path.slug)
    const mutation = viewMutation(view, {
      name: "markRowRelation",
      predict: (value, { kind, source, target }: RowRelation) => {
        const [forward, inverse] = fields[kind]
        const counted = (other: LinkedTicket) =>
          other.archivedAt === null &&
          (kind === "related" || !finished.has(other.status))
        const next = counted(target)
          ? patch(value, source.id, { incrementRelation: forward })
          : value
        return counted(source)
          ? patch(next, target.id, { incrementRelation: inverse })
          : next
      },
      call: (client, { kind, source, target }) =>
        client.tickets.mark({
          params: { ...path, id: source.id },
          payload: { kind, target: target.id }
        }),
      confirm: keepPredicted,
      publish: (_, { source, target }) => [
        ...Keys.ticketChanged(scope, source.id),
        Keys.ticket(scope, target.id)
      ]
    })
    const unmount = registry.mount(view)
    return fireMutation(registry, mutation, relation)
      .then(Result.toExit)
      .finally(unmount)
  }) satisfies MarkRowRelation

export const ticketRowActions = <V, E>(
  view: OptimisticView<V, E>,
  path: BulkTicketsRequest,
  patch: (value: V, id: TicketId, change: TicketPrediction) => V,
  drop: (value: V, input: BulkDeleteTicketsInput) => V,
  archived = false
) => ({
  mark: markRelationInView(view, path, patch),
  remove: removeFromView(view, path, (value, input) => {
    const next =
      input.kind === "archive" && archived ? value : drop(value, input)
    return input.kind === "archive" && input.duplicateOf !== undefined
      ? patch(next, input.duplicateOf, { incrementRelation: "duplicateCount" })
      : next
  })
})
