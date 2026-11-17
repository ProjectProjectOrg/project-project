import type { EpicSectionKey, TicketId, TicketListQuery } from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"

import { persisted } from "@/api/bootCache"
import { projectScope } from "@/api/keys"
import { bindRowMutation } from "@/api/viewMutation"
import { localParentSections } from "@/features/local/atoms/localParentSections"
import { localValue } from "@/features/local/atoms/readLocal"
import type { ParentGrouping } from "@/features/tickets/lib/backlogGrouping"
import {
  EpicSectionsData,
  firstScreenEpicSections
} from "@/features/tickets/lib/epicSectionRows"
import {
  toRow,
  viewQuery,
  withCreatedKeys,
  type QueryWithView,
  type QuickCreateInput
} from "@/features/tickets/lib/ticketRows"

import { encodeTicketListQuery } from "./backlog"
import { createdKeys } from "./createdKeys"
import { epicLoadedPages } from "./epicPages"
import {
  loadMorePages,
  localBulkUpdate,
  localCreate,
  localTicketMove,
  localTicketUpdate
} from "./ticketRows"

export type EpicSectionsRequest = Readonly<{
  _view: "epicSections"
  by: ParentGrouping
  params: Readonly<{ orgSlug: string; slug: string }>
  query: TicketListQuery
}>

export const epicSectionsRequest = (
  orgSlug: string,
  slug: string,
  query: QueryWithView,
  by: ParentGrouping
): EpicSectionsRequest => ({
  _view: "epicSections",
  by,
  params: { orgSlug, slug },
  query: {
    ...viewQuery(query),
    cursor: undefined
  }
})

const scopeOf = (req: EpicSectionsRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

const epicSectionsView = (req: EpicSectionsRequest) =>
  Atom.make((get) => {
    const created = get(createdKeys(scopeOf(req)))
    return AsyncResult.map(
      localValue(get(localParentSections(req))),
      (value): EpicSectionsData => ({
        total: value.total,
        counts: value.counts,
        sections: value.sections.map((section) => ({
          key: section.key,
          parent: section.parent,
          count: section.count,
          page: {
            items: withCreatedKeys(section.page.items.map(toRow), created),
            nextCursor: section.page.nextCursor
          }
        }))
      })
    )
  }).pipe(
    persisted(
      `view/${scopeOf(req)}/${req.by}/${encodeTicketListQuery(req.query)}`,
      EpicSectionsData,
      firstScreenEpicSections
    )
  )

export const epicSections = Atom.family(epicSectionsView)

export const loadMoreEpicSections = Atom.family(
  ({ req, key }: Readonly<{ req: EpicSectionsRequest; key: EpicSectionKey }>) =>
    loadMorePages(epicLoadedPages(req), key)
)

export const updateEpicSectionsTicket = Atom.family(
  ({ req, id }: Readonly<{ req: EpicSectionsRequest; id: TicketId }>) =>
    localTicketUpdate({ ...req.params, id })
)

export const epicSectionsTicketUpdates = bindRowMutation(
  updateEpicSectionsTicket
)

export const bulkUpdateEpicSectionsTickets = Atom.family(
  (req: EpicSectionsRequest) => localBulkUpdate(req.params)
)

export const bulkMoveEpicSectionsTickets = Atom.family(
  (req: EpicSectionsRequest) => localTicketMove(req.params)
)

export const quickCreateEpicSectionsTicket = Atom.family(
  ({ req }: Readonly<{ req: EpicSectionsRequest; key: EpicSectionKey }>) =>
    localCreate(req.params, (input: QuickCreateInput) => ({
      ...input,
      sprint: input.sprint ?? null
    }))
)
