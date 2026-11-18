import {
  AssigneeFilter,
  BacklogGrouping,
  DEFAULT_TICKET_SORT,
  EstimateFilterValue,
  GroupId,
  GroupIdFilter,
  LEGACY_NO_TYPE,
  NO_TYPE_FILTER,
  ParentFilter,
  SortDir,
  SortKey,
  SubTicketsMode,
  TagName,
  TicketId,
  TicketListQuery,
  TicketStatus,
  TicketListSource,
  TypeFilter
} from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
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

const TypeSearch = Schema.Union([
  Schema.Literal(LEGACY_NO_TYPE).transform(NO_TYPE_FILTER),
  TypeFilter
])

export const TicketListSearch = Schema.Struct({
  status: Schema.optional(Schema.ArrayEnsure(TicketStatus)),
  type: Schema.optional(Schema.ArrayEnsure(TypeSearch)),
  excludeType: Schema.optional(Schema.ArrayEnsure(TypeSearch)),
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
    view: Schema.optional(Schema.Literals(["list", "board"])),
    group: Schema.optional(BacklogGrouping)
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
    group: BacklogGrouping,
    sprint: Schema.optional(GroupId)
  })
)
const SprintBoardSearch = TicketListSearch.pipe(
  Schema.fieldsAssign({
    from: Schema.Literal("sprintBoard"),
    sprint: GroupId
  })
)

const ParentSearch = Schema.Struct({
  from: Schema.Literal("parent"),
  parentId: TicketId
})

export type TicketNavigationSearch =
  | typeof SectionSearch.Type
  | typeof SprintBoardSearch.Type
  | typeof ParentSearch.Type

const TicketParentSource = Schema.TaggedStruct("parent", { parent: TicketId })

export type TicketPageSource = TicketListSource | typeof TicketParentSource.Type

const TicketActions = {
  focusBody: Schema.optional(Schema.Literal("1")),
  splitInto: Schema.optional(Schema.ArrayEnsure(TicketId)).pipe(
    Schema.catchDecoding(() => Effect.succeed(Option.some(undefined)))
  )
}

export const TicketDetailSearch = Schema.Union([
  SectionSearch.pipe(Schema.fieldsAssign(TicketActions)),
  SprintBoardSearch.pipe(Schema.fieldsAssign(TicketActions)),
  ParentSearch.pipe(Schema.fieldsAssign(TicketActions)),
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

export function ticketQueryFromSearch(search: TicketListSearch) {
  return decodeQuery({
    ...search,
    sort: {
      key: search.sort ?? DEFAULT_TICKET_SORT.key,
      dir: search.dir ?? DEFAULT_TICKET_SORT.dir
    }
  })
}

export function ticketSearchFromQuery(query: TicketListQuery) {
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
  } satisfies TicketListSearch
}

export function ticketSearchFromSource(source: TicketListSource) {
  const query = ticketSearchFromQuery(source.query)
  return TicketListSource.isAnyOf(["sections"])(source)
    ? ({
        ...query,
        from: source._tag,
        group: source.grouping
      } satisfies TicketNavigationSearch)
    : ({
        ...query,
        from: source._tag,
        sprint: source.groupId
      } satisfies TicketNavigationSearch)
}

export function ticketPageSearch(
  from: TicketPageSource | undefined,
  sprint: GroupId | undefined
) {
  if (from === undefined) return {} satisfies TicketDetailSearch
  if (Predicate.isTagged(from, "parent"))
    return {
      from: "parent",
      parentId: from.parent
    } satisfies TicketDetailSearch
  const search = ticketSearchFromSource(from)
  return search.from === "sections" && sprint !== undefined
    ? ({ ...search, sprint } satisfies TicketDetailSearch)
    : (search satisfies TicketDetailSearch)
}

export function sprintFromSearch(search: TicketDetailSearch) {
  return search.from === "sections" || search.from === "sprintBoard"
    ? search.sprint
    : undefined
}

export function ticketSourceFromSearch(search: TicketDetailSearch) {
  if (search.from === undefined) return undefined
  if (search.from === "parent")
    return TicketParentSource.make({ parent: search.parentId })
  const query = ticketQueryFromSearch(search)
  return search.from === "sections"
    ? TicketListSource.cases.sections.make({ grouping: search.group, query })
    : TicketListSource.cases.sprintBoard.make({
        groupId: search.sprint,
        query
      })
}
