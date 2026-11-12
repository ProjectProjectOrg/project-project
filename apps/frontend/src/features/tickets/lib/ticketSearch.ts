import {
  AssigneeFilter,
  BacklogGrouping,
  DEFAULT_TICKET_SORT,
  EstimateFilterValue,
  GroupId,
  GroupIdFilter,
  ParentFilter,
  SortDir,
  SortKey,
  SubTicketsMode,
  TagName,
  TicketId,
  TicketListQuery,
  TicketStatus,
  TicketType,
  type TicketViewSource
} from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

const BooleanParam = Schema.Union([
  Schema.Literal("true").transform(true),
  Schema.Literal("false").transform(false)
])
const BooleanSearch = Schema.toEncoded(BooleanParam)
const encodeBoolean = Schema.encodeSync(Schema.optional(BooleanParam))
const decodeDate = Schema.decodeUnknownOption(Schema.DateFromString)
const DateSearch = Schema.String.pipe(
  Schema.check(Schema.makeFilter((value) => Option.isSome(decodeDate(value))))
)

export const TicketListSearch = Schema.Struct({
  status: Schema.optional(Schema.ArrayEnsure(TicketStatus)),
  type: Schema.optional(Schema.ArrayEnsure(TicketType)),
  assignee: Schema.optional(Schema.ArrayEnsure(AssigneeFilter)),
  tags: Schema.optional(Schema.ArrayEnsure(TagName)),
  groupId: Schema.optional(Schema.ArrayEnsure(GroupIdFilter)),
  estimate: Schema.optional(Schema.ArrayEnsure(EstimateFilterValue)),
  parent: Schema.optional(Schema.ArrayEnsure(ParentFilter)),
  hasBranch: Schema.optional(BooleanSearch),
  hasPr: Schema.optional(BooleanSearch),
  archived: Schema.optional(BooleanSearch),
  blocked: Schema.optional(BooleanSearch),
  flagged: Schema.optional(BooleanSearch),
  updatedAfter: Schema.optional(DateSearch),
  subTickets: Schema.optional(SubTicketsMode),
  sort: Schema.optional(SortKey),
  dir: Schema.optional(SortDir),
  q: TicketListQuery.fields.q,
  cursor: TicketListQuery.fields.cursor
})
export type TicketListSearch = typeof TicketListSearch.Type

export const BacklogSearch = TicketListSearch.pipe(
  Schema.fieldsAssign({
    view: Schema.optional(Schema.Literals(["list", "board"]))
  })
)

export const SprintSearch = TicketListSearch.pipe(
  Schema.fieldsAssign({
    view: Schema.optional(Schema.Literals(["list", "board", "description"]))
  })
)

const SectionSearch = TicketListSearch.pipe(
  Schema.fieldsAssign({
    from: Schema.Literal("sections"),
    group: BacklogGrouping
  })
)
const SprintBoardSearch = TicketListSearch.pipe(
  Schema.fieldsAssign({
    from: Schema.Literal("sprintBoard"),
    sprint: GroupId
  })
)

export type TicketNavigationSearch =
  | typeof SectionSearch.Type
  | typeof SprintBoardSearch.Type

const TicketActions = {
  focusBody: Schema.optional(Schema.Literal("1")),
  splitInto: Schema.optional(Schema.ArrayEnsure(TicketId)).pipe(
    Schema.catchDecoding(() => Effect.succeed(Option.some(undefined)))
  )
}

export const TicketDetailSearch = Schema.Union([
  SectionSearch.pipe(Schema.fieldsAssign(TicketActions)),
  SprintBoardSearch.pipe(Schema.fieldsAssign(TicketActions)),
  Schema.Struct({
    ...TicketActions,
    from: Schema.optional(Schema.Undefined).pipe(
      Schema.catchDecoding(() => Effect.succeed(Option.some(undefined)))
    )
  })
])
export type TicketDetailSearch = typeof TicketDetailSearch.Type

const decodeQuery = Schema.decodeUnknownSync(
  Schema.toCodecStringTree(TicketListQuery)
)

export function ticketQueryFromSearch(
  search: TicketListSearch
): TicketListQuery {
  return decodeQuery({
    ...search,
    sort: {
      key: search.sort ?? DEFAULT_TICKET_SORT.key,
      dir: search.dir ?? DEFAULT_TICKET_SORT.dir
    }
  })
}

export function ticketSearchFromQuery(
  query: TicketListQuery
): TicketListSearch {
  const {
    sort,
    hasBranch,
    hasPr,
    archived,
    blocked,
    flagged,
    updatedAfter,
    ...filter
  } = query
  const defaultSort =
    sort.key === DEFAULT_TICKET_SORT.key && sort.dir === DEFAULT_TICKET_SORT.dir
  return {
    ...filter,
    updatedAfter: updatedAfter?.toISOString(),
    hasBranch: encodeBoolean(hasBranch),
    hasPr: encodeBoolean(hasPr),
    archived: encodeBoolean(archived),
    blocked: encodeBoolean(blocked),
    flagged: encodeBoolean(flagged),
    sort: defaultSort ? undefined : query.sort.key,
    dir: defaultSort ? undefined : query.sort.dir
  }
}

export function ticketSearchFromSource(
  source: TicketViewSource
): TicketNavigationSearch {
  const query = ticketSearchFromQuery(source.query)
  return source.kind === "sections"
    ? { ...query, from: source.kind, group: source.grouping }
    : { ...query, from: source.kind, sprint: source.groupId }
}

export function ticketSourceFromSearch(
  search: TicketDetailSearch
): TicketViewSource | undefined {
  if (search.from === undefined) return undefined
  const query = ticketQueryFromSearch(search)
  return search.from === "sections"
    ? { kind: search.from, grouping: search.group, query }
    : { kind: search.from, groupId: search.sprint, query }
}
