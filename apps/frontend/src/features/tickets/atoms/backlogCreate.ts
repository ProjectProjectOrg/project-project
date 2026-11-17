import { matchesTicketQuery, type Ticket, TicketStatus } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Atom from "effect/reactivity/Atom"

import { Keys, projectScope } from "@/api/keys"
import { viewMutation } from "@/api/viewMutation"
import {
  placeholderRow,
  type QuickCreateInput,
  quickCreatePayload
} from "@/features/tickets/lib/ticketRows"

import { backlog, type BacklogRequest, type BacklogValue } from "./backlog"
import { recordCreatedKey } from "./createdKeys"
import { localCreate } from "./ticketRows"

const scopeOf = (req: BacklogRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

const filtersBySprint = (req: BacklogRequest) =>
  (req.query.groupId?.length ?? 0) > 0 &&
  !req.query.groupId?.includes("ungrouped")

const insertCreated = (
  req: BacklogRequest,
  value: BacklogValue,
  input: QuickCreateInput
): BacklogValue => {
  const status = input.payload.status ?? TicketStatus.make("todo")
  const section = value.sections[status] ?? { items: [], nextCursor: null }
  const row = placeholderRow(
    input,
    section.items,
    status,
    DateTime.toDate(DateTime.nowUnsafe())
  )
  if (
    !matchesTicketQuery(
      row.ticket,
      { ...req.query, status: undefined },
      undefined,
      input.prediction.estimation
    ) ||
    filtersBySprint(req)
  )
    return value
  return {
    counts: {
      total: value.counts.total + 1,
      byStatus: {
        ...value.counts.byStatus,
        [status]: (value.counts.byStatus[status] ?? 0) + 1
      }
    },
    sections: {
      ...value.sections,
      [status]: { ...section, items: [row, ...section.items] }
    }
  }
}

const confirmCreated = (
  value: BacklogValue,
  created: Ticket,
  input: QuickCreateInput
): BacklogValue => ({
  ...value,
  sections: Object.fromEntries(
    Object.entries(value.sections).map(([status, section]) => [
      status,
      {
        ...section,
        items: section.items.map((row) =>
          row.key === input.prediction.clientId
            ? { ...row, ticket: created, pending: false }
            : row
        )
      }
    ])
  )
})

export const quickCreateBacklogTicketOnServer = Atom.family(
  (req: BacklogRequest) =>
    viewMutation(backlog(req), {
      name: "quickCreateBacklogTicket",
      predict: (value, input: QuickCreateInput) =>
        insertCreated(req, value, input),
      call: (client, input, get) =>
        client.tickets
          .quickCreate({
            params: req.params,
            payload: quickCreatePayload(input)
          })
          .pipe(
            Effect.tap((created) =>
              Effect.sync(() =>
                recordCreatedKey(
                  get,
                  scopeOf(req),
                  created.id,
                  input.prediction.clientId
                )
              )
            )
          ),
      confirm: confirmCreated,
      publish: () => Keys.ticketsChanged(scopeOf(req))
    })
)

export const quickCreateBacklogTicket = Atom.family((req: BacklogRequest) =>
  localCreate(req.params, (input: QuickCreateInput) => ({
    ...input,
    sprint: input.sprint ?? null
  }))
)
