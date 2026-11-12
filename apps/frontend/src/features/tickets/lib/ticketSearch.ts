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
  TicketListQueryCompatibility,
  TicketFilterRule,
  TicketFilterRules,
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

const RuleParam = Schema.fromJsonString(TicketFilterRule)
const decodeRule = Schema.decodeUnknownSync(RuleParam)
const encodeRule = Schema.encodeSync(RuleParam)
const validRule = Schema.decodeUnknownOption(RuleParam)

const TicketListSearchInput = Schema.Struct({
  scopeGroupId: Schema.optional(GroupId),
  rule: Schema.optional(
    Schema.ArrayEnsure(
      Schema.String.pipe(
        Schema.check(
          Schema.makeFilter((value) => Option.isSome(validRule(value)))
        )
      )
    ).pipe(
      Schema.check(
        Schema.makeFilter(
          (values) =>
            new Set(values.map((value) => decodeRule(value).field)).size ===
              values.length || "A field can only have one filter rule"
        )
      )
    )
  ),
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
  updatedAfter: Schema.optional(DateSearch),
  subTickets: Schema.optional(SubTicketsMode),
  sort: Schema.optional(SortKey),
  dir: Schema.optional(SortDir),
  q: TicketListQuery.fields.q,
  cursor: TicketListQuery.fields.cursor
})

const validSearch = Schema.makeFilter(
  (search: typeof TicketListSearchInput.Type) =>
    search.rule === undefined ||
    ![
      search.status,
      search.type,
      search.assignee,
      search.tags,
      search.groupId,
      search.estimate,
      search.archived,
      search.blocked
    ].some((value) => value !== undefined) ||
    "Use rules or legacy filter fields, not both"
)
export const TicketListSearch = TicketListSearchInput.pipe(
  Schema.check(validSearch)
)
export type TicketListSearch = typeof TicketListSearch.Type

export const BacklogSearch = TicketListSearch.pipe(
  Schema.fieldsAssign({
    view: Schema.optional(Schema.Literals(["list", "board"]))
  }),
  Schema.check(validSearch)
)

export const SprintSearch = TicketListSearch.pipe(
  Schema.fieldsAssign({
    view: Schema.optional(Schema.Literals(["list", "board", "description"]))
  }),
  Schema.check(validSearch)
)

const SectionSearch = TicketListSearch.pipe(
  Schema.fieldsAssign({
    from: Schema.Literal("sections"),
    group: BacklogGrouping
  }),
  Schema.check(validSearch)
)
const SprintBoardSearch = TicketListSearch.pipe(
  Schema.fieldsAssign({
    from: Schema.Literal("sprintBoard"),
    sprint: GroupId
  }),
  Schema.check(validSearch)
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
  SectionSearch.pipe(
    Schema.fieldsAssign(TicketActions),
    Schema.check(validSearch)
  ),
  SprintBoardSearch.pipe(
    Schema.fieldsAssign(TicketActions),
    Schema.check(validSearch)
  ),
  Schema.Struct({
    ...TicketActions,
    from: Schema.optional(Schema.Undefined).pipe(
      Schema.catchDecoding(() => Effect.succeed(Option.some(undefined)))
    )
  })
])
export type TicketDetailSearch = typeof TicketDetailSearch.Type

const decodeQuery = Schema.decodeUnknownSync(
  Schema.toCodecStringTree(TicketListQueryCompatibility)
)

export function ticketQueryFromSearch(
  search: TicketListSearch
): TicketListQuery {
  const { rule, ...fields } = search
  return decodeQuery({
    ...fields,
    rules: rule
      ? Schema.decodeUnknownSync(TicketFilterRules)(
          rule.map((value) => decodeRule(value))
        )
      : undefined,
    sort: {
      key: search.sort ?? DEFAULT_TICKET_SORT.key,
      dir: search.dir ?? DEFAULT_TICKET_SORT.dir
    }
  })
}

export function ticketSearchFromQuery(
  query: TicketListQuery
): TicketListSearch {
  const { sort, hasBranch, hasPr, rules, updatedAfter, ...filter } = query
  const defaultSort =
    sort.key === DEFAULT_TICKET_SORT.key && sort.dir === DEFAULT_TICKET_SORT.dir
  return {
    ...filter,
    updatedAfter: updatedAfter?.toISOString(),
    hasBranch: encodeBoolean(hasBranch),
    hasPr: encodeBoolean(hasPr),
    rule: rules?.length ? rules.map((rule) => encodeRule(rule)) : undefined,
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
