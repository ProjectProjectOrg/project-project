import type { TicketId } from "@pp/shared"
import * as Exit from "effect/Exit"
import type { AtomRegistry } from "effect/reactivity/AtomRegistry"

import { currentUserId } from "@/features/auth/atoms/auth"
import { readViewPreference } from "@/hooks/useViewPreference"

import { readBacklogGrouping } from "../lib/backlogGrouping"
import { ticketQueryFromSearch } from "../lib/ticketSearch"
import { backlogRequest, backlogTicketUpdates } from "./backlog"
import type { BulkTicketsRequest } from "./bulkTickets"
import { epicSectionsRequest, epicSectionsTicketUpdates } from "./epicSections"
import type { RemoveTickets, TicketRemoval } from "./removeTickets"
import {
  sprintSectionsRequest,
  sprintSectionsTicketUpdates
} from "./sprintSections"

const destination = (
  registry: AtomRegistry,
  { orgSlug, slug }: BulkTicketsRequest
) => {
  const query = ticketQueryFromSearch({})
  const grouping =
    readViewPreference(orgSlug, slug, "backlog") === "board"
      ? "status"
      : readBacklogGrouping(registry.get(currentUserId) ?? "", orgSlug, slug)
  if (grouping === "sprint")
    return sprintSectionsTicketUpdates(
      sprintSectionsRequest(orgSlug, slug, query)
    ).remove
  if (grouping === "epic" || grouping === "parent")
    return epicSectionsTicketUpdates(
      epicSectionsRequest(orgSlug, slug, query, grouping)
    ).remove
  return backlogTicketUpdates(backlogRequest(orgSlug, slug, query)).remove
}

export const runTicketRemoval = async (
  registry: AtomRegistry,
  path: BulkTicketsRequest,
  input: TicketRemoval,
  viewFor: (id: TicketId) => RemoveTickets | undefined
) => {
  const byView = new Map<RemoveTickets | undefined, Array<TicketId>>()
  for (const id of input.tickets) {
    const view = viewFor(id)
    const group = byView.get(view)
    if (group) group.push(id)
    else byView.set(view, [id])
  }
  const exits = await Promise.all(
    [...byView].map(([remove, tickets]) =>
      (remove ?? destination(registry, path))(registry, { ...input, tickets })
    )
  )
  return exits.find(Exit.isFailure) ?? Exit.void
}
