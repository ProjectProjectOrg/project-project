import {
  estimateRank,
  padNumericIdSort,
  TicketId,
  type EstimationMode,
  type QuickCreateTicketInput,
  type TagName,
  type Ticket,
  type TicketFilter,
  type TicketListQuery,
  type TicketListRow,
  type TicketPriority,
  type TicketSort,
  type TicketStatus,
  type UpdateTicketInput
} from "@pp/shared"

import { compareCodePoints } from "@/lib/orderKey"

import { PRIORITY_META } from "./priorityMeta"
import { NON_EPIC_TYPES } from "./ticketMeta"
import { applyTicketPatch } from "./ticketPatch"

export type TicketRow = Readonly<{
  ticket: Ticket
  /** React key. Equals the ticket id except for rows created in this session. */
  key: string
  /** Server sort position, or the matching local position while an edit is pending. */
  orderKey: string | null
  pending: boolean
}>

export type TicketRowPage = Readonly<{
  items: ReadonlyArray<TicketRow>
  nextCursor: string | null
}>

export type QueryWithView = TicketListQuery & Readonly<{ view?: unknown }>

export const ticketListQueryOf = (query: QueryWithView): TicketListQuery => {
  const { view: _view, ...rest } = query
  return rest
}

export const withoutEpicsByDefault = <Q extends TicketFilter>(query: Q): Q =>
  query.type?.length ? query : { ...query, type: NON_EPIC_TYPES }

export const toRow = (row: TicketListRow): TicketRow => ({
  ticket: row.ticket,
  key: row.ticket.id,
  orderKey: row.orderKey,
  pending: false
})

export const dedupeById = (
  rows: ReadonlyArray<TicketRow>
): ReadonlyArray<TicketRow> => {
  const seen = new Set<string>()
  const out: Array<TicketRow> = []
  for (const row of rows) {
    if (seen.has(row.ticket.id)) continue
    seen.add(row.ticket.id)
    out.push(row)
  }
  return out
}

export const withCreatedKeys = (
  rows: ReadonlyArray<TicketRow>,
  createdKeys: ReadonlyMap<TicketId, string>
): ReadonlyArray<TicketRow> =>
  dedupeById(rows).map((row) => ({
    ...row,
    key: createdKeys.get(row.ticket.id) ?? row.key
  }))

export const insertByOrderKey = (
  items: ReadonlyArray<TicketRow>,
  row: TicketRow,
  dir: TicketSort["dir"]
): ReadonlyArray<TicketRow> => {
  const orderKey = row.orderKey
  if (orderKey === null) return [row, ...items]
  let low = 0
  let high = items.length
  while (low < high) {
    const middle = (low + high) >>> 1
    const candidate = items[middle].orderKey
    const sortsBefore =
      candidate === null ||
      (dir === "asc"
        ? compareCodePoints(candidate, orderKey) < 0
        : compareCodePoints(candidate, orderKey) > 0)
    if (sortsBefore) low = middle + 1
    else high = middle
  }
  return [...items.slice(0, low), row, ...items.slice(low)]
}

export const patchesSortedField = (
  patch: UpdateTicketInput,
  key: TicketSort["key"]
): boolean => {
  if (key === "updated") return true
  if (key === "title") return patch.title !== undefined
  if (key === "priority") return patch.priority !== undefined
  if (key === "estimate") return patch.estimate !== undefined
  return false
}

export const localOrderKey = (ticket: Ticket, sort: TicketSort): string => {
  let value: string
  switch (sort.key) {
    case "id":
      value = padNumericIdSort(ticket.id) ?? ticket.id
      break
    case "created":
      value = ticket.createdAt.toISOString()
      break
    case "updated":
      value = ticket.updatedAt.toISOString()
      break
    case "title":
      value = ticket.title.toLowerCase()
      break
    case "priority":
      value = String(PRIORITY_META[ticket.priority].ordinal + 1).padStart(
        2,
        "0"
      )
      break
    case "estimate":
      value = String(
        ticket.estimate === null ? 0 : estimateRank(ticket.estimate)
      ).padStart(6, "0")
      break
  }
  return `${value}\u0000${ticket.id}`
}

export const placeholderId = (
  taken: ReadonlyArray<TicketRow>,
  prefix: string
): TicketId => {
  const used = new Set(taken.map((row) => row.ticket.id))
  let n = 999999
  while (used.has(TicketId.make(`${prefix}-${n}`))) n++
  return TicketId.make(`${prefix}-${n}`)
}

export type TemplatePrediction = Readonly<{
  priority: TicketPriority | null
  tags: ReadonlyArray<TagName>
}>

export type QuickCreatePrediction = Partial<TemplatePrediction> &
  Readonly<{
    clientId: string
    createdBy: string
    projectPrefix: string
    estimation: EstimationMode
  }>

export type QuickCreateInput = Readonly<{
  payload: QuickCreateTicketInput
  prediction: QuickCreatePrediction
}>

export const predictedTicket = (
  input: QuickCreateInput,
  id: TicketId,
  status: TicketStatus,
  now: Date
): Ticket => ({
  id,
  title: input.payload.title,
  status,
  type: input.payload.type ?? "other",
  priority: input.prediction.priority ?? "med",
  estimate: null,
  tags: input.prediction.tags ?? [],
  branch: null,
  pr: null,
  prState: null,
  lastTransitionedPr: null,
  gitState: { tag: "no_branch", baseBranch: "" },
  assignees: [],
  parent: input.payload.parent ?? null,
  archivedAt: null,
  createdBy: input.prediction.createdBy,
  createdAt: now,
  updatedAt: now
})

export const placeholderRow = (
  input: QuickCreateInput,
  taken: ReadonlyArray<TicketRow>,
  status: TicketStatus,
  now: Date
): TicketRow => ({
  ticket: predictedTicket(
    input,
    placeholderId(taken, input.prediction.projectPrefix),
    status,
    now
  ),
  key: input.prediction.clientId,
  orderKey: null,
  pending: true
})

export const patchTicketRow = (
  row: TicketRow,
  patch: UpdateTicketInput,
  sort: TicketSort,
  now: Date
): TicketRow => {
  const ticket = { ...applyTicketPatch(row.ticket, patch), updatedAt: now }
  return {
    ...row,
    ticket,
    orderKey: patchesSortedField(patch, sort.key)
      ? localOrderKey(ticket, sort)
      : row.orderKey
  }
}
