import {
  SPRINT_SECTION_UNSCHEDULED,
  EstimateSummary,
  type GroupId,
  SprintSectionKey,
  TicketCounts,
  type TicketId,
  type TicketListQuery
} from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import * as Schema from "effect/Schema"

import { persisted } from "@/api/bootCache"
import { projectScope } from "@/api/keys"
import { bindRowMutation } from "@/api/viewMutation"
import { localSprintSections } from "@/features/local/atoms/localSprintSections"
import { localValue } from "@/features/local/atoms/readLocal"
import {
  sprintList,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import { firstScreenSprintPages } from "@/features/tickets/lib/sprintSectionRows"
import {
  toRow,
  withCreatedKeys,
  type QueryWithView,
  type QuickCreateInput,
  TicketRowPage,
  viewQuery
} from "@/features/tickets/lib/ticketRows"

import { encodeTicketListQuery } from "./backlog"
import { createdKeys } from "./createdKeys"
import { sprintLoadedPages } from "./sprintPages"
import {
  loadMorePages,
  localBulkUpdate,
  localCreate,
  localTicketMove,
  localTicketUpdate
} from "./ticketRows"

export type SprintSectionsRequest = Readonly<{
  _view: "sprintSections"
  params: Readonly<{ orgSlug: string; slug: string }>
  query: TicketListQuery
}>

export const sprintSectionsRequest = (
  orgSlug: string,
  slug: string,
  query: QueryWithView
): SprintSectionsRequest => ({
  _view: "sprintSections",
  params: { orgSlug, slug },
  query: {
    ...viewQuery(query),
    cursor: undefined
  }
})

const scopeOf = (req: SprintSectionsRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

export const SprintSectionValue = Schema.Struct({
  key: SprintSectionKey,
  count: Schema.Finite,
  estimates: Schema.NullOr(EstimateSummary),
  page: TicketRowPage
})
export type SprintSectionValue = typeof SprintSectionValue.Type

export const SprintSectionsData = Schema.Struct({
  total: Schema.Finite,
  counts: TicketCounts,
  sections: Schema.Array(SprintSectionValue)
})
export type SprintSectionsData = typeof SprintSectionsData.Type

const firstScreen = (
  req: SprintSectionsRequest,
  data: SprintSectionsData,
  get: Atom.AtomContext
): SprintSectionsData => {
  const sprints = get(
    sprintList(sprintListRequest(req.params.orgSlug, req.params.slug))
  )
  const pages = firstScreenSprintPages(
    data.sections,
    AsyncResult.isSuccess(sprints) ? sprints.value : [],
    req.query.q
  )
  return {
    total: data.total,
    counts: data.counts,
    sections: data.sections.map((section, index) => ({
      key: section.key,
      count: section.count,
      estimates: section.estimates,
      page: pages[index] ?? { items: [], nextCursor: null }
    }))
  }
}

const sprintSectionsView = (req: SprintSectionsRequest) =>
  Atom.make((get) => {
    const created = get(createdKeys(scopeOf(req)))
    return AsyncResult.map(
      localValue(get(localSprintSections(req))),
      (value): SprintSectionsData => ({
        total: value.total,
        counts: value.counts,
        sections: value.sections.map((section) => ({
          key: section.key,
          count: section.count,
          estimates: section.estimates,
          page: {
            items: withCreatedKeys(section.page.items.map(toRow), created),
            nextCursor: section.page.nextCursor
          }
        }))
      })
    )
  }).pipe(
    persisted(
      `view/${scopeOf(req)}/sprint/${encodeTicketListQuery(req.query)}`,
      SprintSectionsData,
      (value, get) => firstScreen(req, value, get)
    )
  )

export const sprintSections = Atom.family(sprintSectionsView)

export const loadMoreSprintSections = Atom.family(
  ({
    req,
    key
  }: Readonly<{
    req: SprintSectionsRequest
    key: SprintSectionKey
  }>) => loadMorePages(sprintLoadedPages(req), key)
)

export const updateSprintSectionsTicket = Atom.family(
  ({ req, id }: Readonly<{ req: SprintSectionsRequest; id: TicketId }>) =>
    localTicketUpdate({ ...req.params, id })
)

export const sprintSectionsTicketUpdates = bindRowMutation(
  updateSprintSectionsTicket
)

export const bulkUpdateSprintSectionsTickets = Atom.family(
  (req: SprintSectionsRequest) => localBulkUpdate(req.params)
)

export const bulkMoveSprintSectionsTickets = Atom.family(
  (req: SprintSectionsRequest) => localTicketMove(req.params)
)

const assignedSprintId = (key: SprintSectionKey): GroupId | undefined =>
  key === SPRINT_SECTION_UNSCHEDULED ? undefined : key

export const quickCreateSprintSectionsTicket = Atom.family(
  ({
    req,
    key
  }: Readonly<{
    req: SprintSectionsRequest
    key: SprintSectionKey
  }>) =>
    localCreate(req.params, (input: QuickCreateInput) => ({
      ...input,
      sprint: assignedSprintId(key) ?? null
    }))
)
