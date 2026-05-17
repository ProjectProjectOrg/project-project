import {
  DEFAULT_TICKET_SORT,
  type AssigneeFilter,
  type SortDir,
  type SortKey,
  type TicketFilter,
  type TicketListQuery,
  type TicketSort
} from "./Ticket"

const ASSIGNEE_UNASSIGNED_SENTINEL = "unassigned"

const STATUS_VALUES = ["todo", "in_progress", "done"] as const
const TYPE_VALUES = ["feat", "bug", "chore", "other"] as const
const SORT_KEY_VALUES = ["id", "created", "updated", "title", "priority"] as const
const SORT_DIR_VALUES = ["asc", "desc"] as const

const asArray = <T>(value: unknown): ReadonlyArray<T> | undefined => {
  if (value === undefined || value === null) return undefined
  if (Array.isArray(value)) return value as ReadonlyArray<T>
  return [value as T]
}

const decodeStatus = (value: unknown) => {
  const arr = asArray<string>(value)
  if (!arr) return undefined
  const filtered = arr.filter((s): s is (typeof STATUS_VALUES)[number] =>
    (STATUS_VALUES as ReadonlyArray<string>).includes(s)
  )
  return filtered.length === 0 ? undefined : filtered
}

const decodeType = (value: unknown) => {
  const arr = asArray<string>(value)
  if (!arr) return undefined
  const filtered = arr.filter((s): s is (typeof TYPE_VALUES)[number] =>
    (TYPE_VALUES as ReadonlyArray<string>).includes(s)
  )
  return filtered.length === 0 ? undefined : filtered
}

const decodeAssignee = (
  value: unknown
): ReadonlyArray<AssigneeFilter> | undefined => {
  const arr = asArray<string>(value)
  if (!arr) return undefined
  const mapped = arr.map((s): AssigneeFilter => {
    if (s === "mine") return "mine"
    if (s === ASSIGNEE_UNASSIGNED_SENTINEL) return null
    return s
  })
  return mapped.length === 0 ? undefined : mapped
}

const decodeStringArray = (value: unknown): ReadonlyArray<string> | undefined => {
  const arr = asArray<string>(value)
  if (!arr) return undefined
  const filtered = arr.filter((s) => typeof s === "string" && s.length > 0)
  return filtered.length === 0 ? undefined : filtered
}

const decodeBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") return value
  if (value === "true") return true
  if (value === "false") return false
  return undefined
}

const decodeSort = (value: unknown): TicketSort => {
  if (typeof value !== "string") return DEFAULT_TICKET_SORT
  const [keyRaw, dirRaw] = value.split(":")
  if (!keyRaw || !dirRaw) return DEFAULT_TICKET_SORT
  if (!(SORT_KEY_VALUES as ReadonlyArray<string>).includes(keyRaw)) {
    return DEFAULT_TICKET_SORT
  }
  if (!(SORT_DIR_VALUES as ReadonlyArray<string>).includes(dirRaw)) {
    return DEFAULT_TICKET_SORT
  }
  return { key: keyRaw as SortKey, dir: dirRaw as SortDir }
}

type MutableTicketFilter = {
  -readonly [K in keyof TicketFilter]: TicketFilter[K]
}

type MutableTicketListQuery = {
  -readonly [K in keyof TicketListQuery]: TicketListQuery[K]
}

export const ticketListQueryFromSearch = (
  search: Record<string, unknown>
): TicketListQuery => {
  const filter: Partial<MutableTicketFilter> = {}
  const status = decodeStatus(search.status)
  if (status) filter.status = status
  const type = decodeType(search.type)
  if (type) filter.type = type
  const assignee = decodeAssignee(search.assignee)
  if (assignee) filter.assignee = assignee
  const tags = decodeStringArray(search.tags)
  if (tags) filter.tags = tags as TicketFilter["tags"]
  const groupId = decodeStringArray(search.groupId)
  if (groupId) filter.groupId = groupId as TicketFilter["groupId"]
  const hasBranch = decodeBoolean(search.hasBranch)
  if (hasBranch !== undefined) filter.hasBranch = hasBranch
  const hasPr = decodeBoolean(search.hasPr)
  if (hasPr !== undefined) filter.hasPr = hasPr

  const out: MutableTicketListQuery = {
    sort: decodeSort(search.sort)
  }
  if (Object.keys(filter).length > 0) out.filter = filter as TicketFilter
  if (typeof search.q === "string" && search.q.length > 0) out.q = search.q
  if (typeof search.cursor === "string" && search.cursor.length > 0) {
    out.cursor = search.cursor
  }
  return out
}

const collapse = <T>(arr: ReadonlyArray<T>): T | ReadonlyArray<T> =>
  arr.length === 1 ? arr[0]! : arr

const encodeAssignee = (
  values: ReadonlyArray<AssigneeFilter>
): string | ReadonlyArray<string> => {
  const mapped = values.map((v) =>
    v === null ? ASSIGNEE_UNASSIGNED_SENTINEL : v
  )
  return collapse(mapped)
}

const isDefaultSort = (sort: TicketSort) =>
  sort.key === DEFAULT_TICKET_SORT.key && sort.dir === DEFAULT_TICKET_SORT.dir

type TicketListQueryInput = {
  filter?: {
    status?: ReadonlyArray<"todo" | "in_progress" | "done">
    type?: ReadonlyArray<"feat" | "bug" | "chore" | "other">
    assignee?: ReadonlyArray<AssigneeFilter>
    tags?: ReadonlyArray<string>
    groupId?: ReadonlyArray<string>
    hasBranch?: boolean
    hasPr?: boolean
    updatedAfter?: Date
  }
  sort?: TicketSort
  q?: string
  cursor?: string
}

export const ticketListQueryToSearch = (
  query: TicketListQueryInput
): Record<string, string | ReadonlyArray<string>> => {
  const out: Record<string, string | ReadonlyArray<string>> = {}
  const f = query.filter
  if (f) {
    if (f.status?.length) out.status = collapse(f.status)
    if (f.type?.length) out.type = collapse(f.type)
    if (f.assignee?.length) out.assignee = encodeAssignee(f.assignee)
    if (f.tags?.length) out.tags = collapse(f.tags)
    if (f.groupId?.length) out.groupId = collapse(f.groupId)
    if (f.hasBranch !== undefined) out.hasBranch = String(f.hasBranch)
    if (f.hasPr !== undefined) out.hasPr = String(f.hasPr)
  }
  if (query.sort && !isDefaultSort(query.sort)) {
    out.sort = `${query.sort.key}:${query.sort.dir}`
  }
  if (query.q && query.q.length > 0) out.q = query.q
  if (query.cursor) out.cursor = query.cursor
  return out
}
