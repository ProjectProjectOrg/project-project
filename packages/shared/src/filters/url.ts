import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SchemaGetter from "effect/SchemaGetter"
import { GroupId } from "../schemas/Group"
import { StatusSlug } from "../schemas/Status"
import { TagName } from "../schemas/Tag"
import { TicketType } from "../schemas/Ticket"
import {
  AssigneeFilter,
  DEFAULT_TICKET_SORT,
  SortDir,
  SortKey,
  TicketCountQuery,
  TicketFilter,
  TicketListQuery,
  type GroupIdFilter,
  type TicketSort
} from "./Ticket"

const MultiStringParam = Schema.Union([
  Schema.String,
  Schema.Array(Schema.String)
])

const BaseTicketFilterParamFields = {
  status: Schema.optional(MultiStringParam),
  type: Schema.optional(MultiStringParam),
  assignee: Schema.optional(MultiStringParam),
  tags: Schema.optional(MultiStringParam),
  groupId: Schema.optional(MultiStringParam),
  hasBranch: Schema.optional(Schema.String),
  hasPr: Schema.optional(Schema.String),
  updatedAfter: Schema.optional(Schema.String),
  archived: Schema.optional(Schema.String),
  q: Schema.optional(Schema.String)
} as const

const RawTicketFilterParams = Schema.Struct(BaseTicketFilterParamFields)
const RawTicketListParams = Schema.Struct({
  ...BaseTicketFilterParamFields,
  sort: Schema.optional(Schema.String),
  cursor: Schema.optional(Schema.String)
})

type RawTicketFilterParams = typeof RawTicketFilterParams.Type
type RawTicketListParams = typeof RawTicketListParams.Type

const BooleanParam = Schema.Literals(["true", "false"]).pipe(
  Schema.decodeTo(Schema.Boolean, {
    decode: SchemaGetter.transform((value) => value === "true"),
    encode: SchemaGetter.transform((value) => (value ? "true" : "false"))
  })
)
const decodeBoolean = Schema.decodeUnknownOption(BooleanParam)
const decodeDate = Schema.decodeUnknownOption(Schema.DateFromString)
const encodeBoolean = Schema.encodeSync(BooleanParam)
const encodeDate = Schema.encodeSync(Schema.DateFromString)

const isStatusSlug = Schema.is(StatusSlug)
const isTicketType = Schema.is(TicketType)
const isAssigneeFilter = Schema.is(AssigneeFilter)
const isTagName = Schema.is(TagName)
const isGroupId = Schema.is(GroupId)
const isSortKey = Schema.is(SortKey)
const isSortDir = Schema.is(SortDir)

const valuesOf = (
  value: string | ReadonlyArray<string> | undefined
): ReadonlyArray<string> =>
  value === undefined ? [] : typeof value === "string" ? [value] : value

const nonEmpty = <A>(values: ReadonlyArray<A>): ReadonlyArray<A> | undefined =>
  values.length > 0 ? values : undefined

const nonEmptyString = (value: string | undefined): string | undefined =>
  value && value.length > 0 ? value : undefined

const decodeGroupIds = (
  value: string | ReadonlyArray<string> | undefined
): TicketFilter["groupId"] => {
  const groupIds: Array<GroupIdFilter> = []
  for (const groupId of valuesOf(value)) {
    if (groupId === "unassigned" || groupId === "ungrouped") {
      groupIds.push("ungrouped")
    } else if (isGroupId(groupId)) {
      groupIds.push(groupId)
    }
  }
  return nonEmpty(groupIds)
}

const decodeTicketFilter = (params: RawTicketFilterParams): TicketFilter => {
  const status = nonEmpty(valuesOf(params.status).filter(isStatusSlug))
  const type = nonEmpty(valuesOf(params.type).filter(isTicketType))
  const assignee = nonEmpty(
    valuesOf(params.assignee).filter(isAssigneeFilter)
  )
  const tags = nonEmpty(valuesOf(params.tags).filter(isTagName))
  const groupId = decodeGroupIds(params.groupId)
  const hasBranch = Option.getOrUndefined(decodeBoolean(params.hasBranch))
  const hasPr = Option.getOrUndefined(decodeBoolean(params.hasPr))
  const updatedAfter = Option.getOrUndefined(decodeDate(params.updatedAfter))
  const archived = Option.getOrUndefined(decodeBoolean(params.archived))

  return {
    ...(status ? { status } : {}),
    ...(type ? { type } : {}),
    ...(assignee ? { assignee } : {}),
    ...(tags ? { tags } : {}),
    ...(groupId ? { groupId } : {}),
    ...(hasBranch !== undefined ? { hasBranch } : {}),
    ...(hasPr !== undefined ? { hasPr } : {}),
    ...(updatedAfter !== undefined ? { updatedAfter } : {}),
    ...(archived !== undefined ? { archived } : {})
  }
}

const decodeSort = (value: string | undefined): TicketSort => {
  if (value === undefined) return DEFAULT_TICKET_SORT
  const [key, dir, extra] = value.split(":")
  return extra === undefined && isSortKey(key) && isSortDir(dir)
    ? { key, dir }
    : DEFAULT_TICKET_SORT
}

const decodeTicketListParams = (
  params: RawTicketListParams
): TicketListQuery => ({
  ...decodeTicketFilter(params),
  sort: decodeSort(params.sort),
  ...(nonEmptyString(params.q) ? { q: params.q } : {}),
  ...(nonEmptyString(params.cursor) ? { cursor: params.cursor } : {})
})

const decodeTicketCountParams = (
  params: RawTicketFilterParams
): TicketCountQuery => ({
  ...decodeTicketFilter(params),
  ...(nonEmptyString(params.q) ? { q: params.q } : {})
})

const encodeGroupIds = (
  values: NonNullable<TicketFilter["groupId"]>
): ReadonlyArray<string> =>
  values.map((groupId) => (groupId === "ungrouped" ? "unassigned" : groupId))

const encodeTicketFilter = (
  filter: TicketFilter
): RawTicketFilterParams => ({
  ...(filter.status?.length ? { status: filter.status } : {}),
  ...(filter.type?.length ? { type: filter.type } : {}),
  ...(filter.assignee?.length ? { assignee: filter.assignee } : {}),
  ...(filter.tags?.length ? { tags: filter.tags } : {}),
  ...(filter.groupId?.length
    ? { groupId: encodeGroupIds(filter.groupId) }
    : {}),
  ...(filter.hasBranch !== undefined
    ? { hasBranch: encodeBoolean(filter.hasBranch) }
    : {}),
  ...(filter.hasPr !== undefined ? { hasPr: encodeBoolean(filter.hasPr) } : {}),
  ...(filter.updatedAfter !== undefined
    ? { updatedAfter: encodeDate(filter.updatedAfter) }
    : {}),
  ...(filter.archived !== undefined
    ? { archived: encodeBoolean(filter.archived) }
    : {})
})

const isDefaultSort = (sort: TicketSort): boolean =>
  sort.key === DEFAULT_TICKET_SORT.key && sort.dir === DEFAULT_TICKET_SORT.dir

const encodeTicketListParams = (
  query: TicketListQuery
): RawTicketListParams => ({
  ...encodeTicketFilter(query),
  ...(!isDefaultSort(query.sort)
    ? { sort: `${query.sort.key}:${query.sort.dir}` }
    : {}),
  ...(nonEmptyString(query.q) ? { q: query.q } : {}),
  ...(nonEmptyString(query.cursor) ? { cursor: query.cursor } : {})
})

const encodeTicketCountParams = (
  query: TicketCountQuery
): RawTicketFilterParams => ({
  ...encodeTicketFilter(query),
  ...(nonEmptyString(query.q) ? { q: query.q } : {})
})

export const TicketListParams = RawTicketListParams.pipe(
  Schema.decodeTo(Schema.toType(TicketListQuery), {
    decode: SchemaGetter.transform(decodeTicketListParams),
    encode: SchemaGetter.transform(encodeTicketListParams)
  })
)

export const TicketCountParams = RawTicketFilterParams.pipe(
  Schema.decodeTo(Schema.toType(TicketCountQuery), {
    decode: SchemaGetter.transform(decodeTicketCountParams),
    encode: SchemaGetter.transform(encodeTicketCountParams)
  })
)

export const ticketListQueryFromSearch =
  Schema.decodeUnknownSync(TicketListParams)

export const ticketListQueryToSearch = Schema.encodeSync(TicketListParams)
