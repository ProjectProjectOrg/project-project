import type * as AsyncResult from "effect/reactivity/AsyncResult"
import type * as Atom from "effect/reactivity/Atom"

import { backlog, backlogRequest } from "@/features/tickets/atoms/backlog"
import {
  epicSections,
  epicSectionsRequest
} from "@/features/tickets/atoms/epicSections"
import {
  sprintSections,
  sprintSectionsRequest
} from "@/features/tickets/atoms/sprintSections"
import { readBacklogGrouping } from "@/features/tickets/components/ticket-list/ProjectTicketLayout"
import type { ticketQueryFromSearch } from "@/features/tickets/lib/ticketSearch"
import { readViewPreference } from "@/hooks/useViewPreference"

export const backlogGroupingFor = (
  viewerId: string | undefined,
  orgSlug: string,
  slug: string,
  view = readViewPreference(orgSlug, slug, "backlog")
) =>
  view === "board"
    ? ("status" as const)
    : viewerId === undefined
      ? undefined
      : readBacklogGrouping(viewerId, orgSlug, slug)

export const backlogFirstScreen = (
  orgSlug: string,
  slug: string,
  query: ReturnType<typeof ticketQueryFromSearch>,
  grouping: ReturnType<typeof backlogGroupingFor>
): ReadonlyArray<Atom.Atom<AsyncResult.AsyncResult<unknown, unknown>>> =>
  grouping === "sprint"
    ? [sprintSections(sprintSectionsRequest(orgSlug, slug, query))]
    : grouping === "epic" || grouping === "parent"
      ? [
          backlog(backlogRequest(orgSlug, slug, query)),
          epicSections(epicSectionsRequest(orgSlug, slug, query, grouping))
        ]
      : [backlog(backlogRequest(orgSlug, slug, query))]
