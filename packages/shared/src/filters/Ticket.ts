import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as SchemaTransformation from "effect/SchemaTransformation"

import { UserId } from "../auth/User"
import { EstimateFilterValue, EstimateSummary } from "../estimates/Estimate"
import { GroupId } from "../groups/Group"
import { Page } from "../pagination/Pagination"
import { Slug } from "../projects/Project"
import { TagName } from "../tags/Tag"
import {
  TicketId,
  TicketParent,
  TicketStatus,
  TicketType
} from "../tickets/Ticket"
import { Ticket, TicketDetail } from "../tickets/Ticket"
import { TicketActivityActor } from "../tickets/TicketActivity"

export const SortKey = Schema.Literals([
  "id",
  "created",
  "updated",
  "title",
  "priority",
  "estimate"
])
export type SortKey = typeof SortKey.Type

export const SortDir = Schema.Literals(["asc", "desc"])
export type SortDir = typeof SortDir.Type

export const TicketSort = Schema.Struct({
  key: SortKey,
  dir: SortDir
})
export type TicketSort = typeof TicketSort.Type

export const DEFAULT_TICKET_SORT: TicketSort = {
  key: "created",
  dir: "desc"
}

export const NATURAL_SORT_DIR: Record<SortKey, SortDir> = {
  id: "asc",
  created: "desc",
  updated: "desc",
  title: "asc",
  priority: "desc",
  estimate: "desc"
}

export const AssigneeFilter = Schema.Union([
  Schema.Literals(["mine", "unassigned"]),
  UserId
])
export type AssigneeFilter = typeof AssigneeFilter.Type

export const GroupIdFilter = Schema.Union([
  Schema.Literal("ungrouped"),
  GroupId
])
export type GroupIdFilter = typeof GroupIdFilter.Type

export const ParentFilter = Schema.Union([Schema.Literal("none"), TicketId])
export type ParentFilter = typeof ParentFilter.Type

export const SubTicketsMode = Schema.Literals(["nested", "flat"])
export type SubTicketsMode = typeof SubTicketsMode.Type

export const LegacyTicketFilterFields = {
  scopeGroupId: Schema.optional(GroupId),
  status: Schema.optional(Schema.Array(TicketStatus)).annotate({
    description: "Status slugs from `list_statuses`."
  }),
  type: Schema.optional(Schema.Array(TicketType)).annotate({
    description: "Ticket types."
  }),
  assignee: Schema.optional(Schema.Array(AssigneeFilter)).annotate({
    description: "User ids, `mine` for yourself, or `unassigned`."
  }),
  tags: Schema.optional(Schema.Array(TagName)).annotate({
    description: "Tag names from `list_tags`."
  }),
  hasBranch: Schema.optional(Schema.Boolean).annotate({
    description: "Whether a branch is linked."
  }),
  hasPr: Schema.optional(Schema.Boolean).annotate({
    description: "Whether a pull request is linked."
  }),
  updatedAfter: Schema.optional(Schema.DateFromString).annotate({
    description: "Only tickets updated after this ISO 8601 timestamp."
  }),
  groupId: Schema.optional(Schema.Array(GroupIdFilter)).annotate({
    description:
      "Group ids, or `ungrouped` for tickets in no planned or active sprint (the backlog)."
  }),
  estimate: Schema.optional(Schema.Array(EstimateFilterValue)).annotate({
    description:
      "`none`, `any`, `stale` (estimated in a unit the project no longer uses) or t-shirt sizes."
  }),
  parent: Schema.optional(Schema.Array(ParentFilter)).annotate({
    description: "Parent ticket ids, or `none` for tickets without one."
  }),
  subTickets: Schema.optional(SubTicketsMode).annotate({
    description:
      "`nested` leaves out a sub-ticket whose parent matches the same filters; `flat` (default) lists every match."
  }),
  archived: Schema.optional(Schema.Boolean).annotate({
    description:
      "`true` lists only archived tickets; they are left out otherwise."
  }),
  blocked: Schema.optional(Schema.Boolean).annotate({
    description:
      "`true` lists only tickets blocked by an unfinished, unarchived ticket; `false` only tickets that aren't."
  })
} as const

const TicketRuleOperator = Schema.Literals(["is", "isNot"])

export const TicketFilterRule = Schema.Union([
  Schema.Struct({
    field: Schema.Literal("status"),
    operator: TicketRuleOperator,
    values: Schema.Array(TicketStatus)
  }),
  Schema.Struct({
    field: Schema.Literal("type"),
    operator: TicketRuleOperator,
    values: Schema.Array(TicketType)
  }),
  Schema.Struct({
    field: Schema.Literal("assignee"),
    operator: TicketRuleOperator,
    values: Schema.Array(AssigneeFilter)
  }),
  Schema.Struct({
    field: Schema.Literal("tags"),
    operator: TicketRuleOperator,
    values: Schema.Array(TagName)
  }),
  Schema.Struct({
    field: Schema.Literal("sprint"),
    operator: TicketRuleOperator,
    values: Schema.Array(GroupIdFilter)
  }),
  Schema.Struct({
    field: Schema.Literal("estimate"),
    operator: TicketRuleOperator,
    values: Schema.Array(EstimateFilterValue)
  }),
  Schema.Struct({
    field: Schema.Literal("archived"),
    operator: TicketRuleOperator
  }),
  Schema.Struct({
    field: Schema.Literal("blocked"),
    operator: TicketRuleOperator
  })
]).pipe(
  Schema.check(
    Schema.makeFilter(
      (rule) =>
        !("values" in rule) ||
        new Set<string>(rule.values).size === rule.values.length ||
        "Filter values must be unique"
    )
  )
)
export type TicketFilterRule = typeof TicketFilterRule.Type

export const TicketFilterRules = Schema.Array(TicketFilterRule).pipe(
  Schema.check(
    Schema.makeFilter(
      (rules) =>
        new Set(rules.map((rule) => rule.field)).size === rules.length ||
        "A field can only have one filter rule"
    )
  )
)

const TicketFilterFields = {
  scopeGroupId: LegacyTicketFilterFields.scopeGroupId,
  rules: Schema.optional(TicketFilterRules),
  hasBranch: LegacyTicketFilterFields.hasBranch,
  hasPr: LegacyTicketFilterFields.hasPr,
  updatedAfter: LegacyTicketFilterFields.updatedAfter,
  parent: LegacyTicketFilterFields.parent,
  subTickets: LegacyTicketFilterFields.subTickets
} as const

export const TicketFilter = Schema.Struct(TicketFilterFields)
export type TicketFilter = typeof TicketFilter.Type

const legacyRuleKeys = [
  "status",
  "type",
  "assignee",
  "tags",
  "groupId",
  "estimate",
  "archived",
  "blocked"
] as const
const LegacyTicketFilter = Schema.Struct(LegacyTicketFilterFields)

export function ticketFilterFromLegacy(
  input: typeof LegacyTicketFilter.Type
): TicketFilter {
  const rules: Array<TicketFilterRule> = []
  if (input.status !== undefined)
    rules.push({
      field: "status",
      operator: "is",
      values: [...new Set(input.status)]
    })
  if (input.type !== undefined)
    rules.push({
      field: "type",
      operator: "is",
      values: [...new Set(input.type)]
    })
  if (input.assignee !== undefined)
    rules.push({
      field: "assignee",
      operator: "is",
      values: [...new Set(input.assignee)]
    })
  if (input.tags !== undefined)
    rules.push({
      field: "tags",
      operator: "is",
      values: [...new Set(input.tags)]
    })
  if (input.groupId !== undefined)
    rules.push({
      field: "sprint",
      operator: "is",
      values: [...new Set(input.groupId)]
    })
  if (input.estimate !== undefined)
    rules.push({
      field: "estimate",
      operator: "is",
      values: [...new Set(input.estimate)]
    })
  if (input.archived !== undefined)
    rules.push({ field: "archived", operator: input.archived ? "is" : "isNot" })
  if (input.blocked !== undefined)
    rules.push({ field: "blocked", operator: input.blocked ? "is" : "isNot" })
  return {
    scopeGroupId: input.scopeGroupId,
    rules: rules.length ? rules : undefined,
    hasBranch: input.hasBranch,
    hasPr: input.hasPr,
    updatedAfter: input.updatedAfter,
    parent: input.parent,
    subTickets: input.subTickets
  }
}

export const TicketFilterInput = Schema.Struct({
  ...LegacyTicketFilterFields,
  rules: TicketFilterFields.rules
})

export const validTicketFilterInput = Schema.makeFilter(
  (input: typeof TicketFilterInput.Type) =>
    input.rules === undefined ||
    !legacyRuleKeys.some((key) => input[key] !== undefined) ||
    "Use rules or legacy filter fields, not both"
)

export function ticketFilterFromInput(
  input: typeof TicketFilterInput.Type
): TicketFilter {
  return input.rules === undefined
    ? ticketFilterFromLegacy(input)
    : {
        scopeGroupId: input.scopeGroupId,
        rules: input.rules,
        hasBranch: input.hasBranch,
        hasPr: input.hasPr,
        updatedAfter: input.updatedAfter,
        parent: input.parent,
        subTickets: input.subTickets
      }
}

export const TICKET_LIST_LIMIT = 50

export const TicketListQuery = TicketFilter.pipe(
  Schema.fieldsAssign({
    sort: TicketSort.annotate({
      description:
        "`{ key, dir }` with `key` one of `id`, `created`, `updated`, `title`, `priority` or `estimate` and `dir` `asc` or `desc` (default newest first)."
    }).pipe(
      Schema.withDecodingDefaultType(Effect.succeed(DEFAULT_TICKET_SORT))
    ),
    q: Schema.optional(Schema.String).annotate({
      description: "Text in the title or ticket id (not the body)."
    }),
    cursor: Schema.optional(Schema.String).annotate({
      description: "The `nextCursor` of the previous page."
    })
  })
)
export type TicketListQuery = typeof TicketListQuery.Type

export const TicketListQueryInput = Schema.Struct({
  ...TicketFilterInput.fields,
  sort: TicketListQuery.fields.sort,
  q: TicketListQuery.fields.q,
  cursor: TicketListQuery.fields.cursor
})

export const ticketListQueryInputTransformation =
  SchemaTransformation.transform({
    decode: (input: typeof TicketListQueryInput.Type): TicketListQuery => ({
      ...ticketFilterFromInput(input),
      sort: input.sort,
      q: input.q,
      cursor: input.cursor
    }),
    encode: (query: TicketListQuery): typeof TicketListQueryInput.Type => query
  })

export const TicketListQueryCompatibility = TicketListQueryInput.pipe(
  Schema.check(validTicketFilterInput),
  Schema.decodeTo(
    Schema.toType(TicketListQuery),
    ticketListQueryInputTransformation
  )
)

export const TicketSection = Schema.Struct({
  status: LegacyTicketFilterFields.status,
  groupId: LegacyTicketFilterFields.groupId,
  parent: TicketFilterFields.parent,
  ticketParent: TicketFilterFields.parent
})
export type TicketSection = typeof TicketSection.Type

export const TicketPageQuery = TicketListQuery.pipe(
  Schema.fieldsAssign({ section: Schema.optional(TicketSection) })
)
export type TicketPageQuery = typeof TicketPageQuery.Type

export const TicketListRow = Schema.Struct({
  ticket: Ticket,
  orderKey: Schema.String
})
export type TicketListRow = typeof TicketListRow.Type

export const TicketListPage = Page(TicketListRow)
export type TicketListPage = typeof TicketListPage.Type

export const OrgTicketRow = Schema.Struct({
  projectSlug: Slug,
  ticket: Ticket
})
export type OrgTicketRow = typeof OrgTicketRow.Type

export const RecentTicketActivity = Schema.Union([
  Schema.Struct({
    tag: Schema.Literal("commented"),
    at: Schema.DateFromString
  }),
  Schema.Struct({
    tag: Schema.Literal("created"),
    at: Schema.DateFromString
  }),
  Schema.Struct({
    tag: Schema.Literal("assigned"),
    actor: Schema.optional(TicketActivityActor),
    at: Schema.optional(Schema.DateFromString)
  }),
  Schema.Struct({
    tag: Schema.Literal("status_changed"),
    actor: TicketActivityActor,
    at: Schema.DateFromString,
    from: TicketStatus,
    to: TicketStatus
  })
])
export type RecentTicketActivity = typeof RecentTicketActivity.Type

export const RecentTicketRow = Schema.Struct({
  ...OrgTicketRow.fields,
  activity: RecentTicketActivity
})
export type RecentTicketRow = typeof RecentTicketRow.Type

export const AssignedStatusCount = Schema.Struct({
  projectSlug: Slug,
  status: TicketStatus,
  count: Schema.Finite
})
export type AssignedStatusCount = typeof AssignedStatusCount.Type

export const OrgTicketPage = Schema.Struct({
  ...Page(OrgTicketRow).fields,
  total: Schema.Finite,
  statusCounts: Schema.Array(AssignedStatusCount)
})
export type OrgTicketPage = typeof OrgTicketPage.Type

export const ProjectTicketsPreview = Schema.Struct({
  projectSlug: Slug,
  total: Schema.Finite,
  tickets: Schema.Array(Ticket)
})
export type ProjectTicketsPreview = typeof ProjectTicketsPreview.Type

export const MY_TICKETS_PAGE_SIZE = TICKET_LIST_LIMIT
export const MY_TICKETS_PER_PROJECT = 5
export const MY_TICKETS_DONE_WINDOW_DAYS = 7
export const RECENT_TICKETS_LIMIT = 5

export const MyTicketsQuery = Schema.Struct({
  cursor: Schema.optional(Schema.String)
})
export type MyTicketsQuery = typeof MyTicketsQuery.Type

export const TicketOrderKeyQuery = Schema.Struct({
  sort: Schema.optional(TicketSort)
})
export type TicketOrderKeyQuery = typeof TicketOrderKeyQuery.Type

export const TicketUpdateResult = Schema.Struct({
  ticket: TicketDetail,
  orderKey: Schema.NullOr(Schema.String)
})
export type TicketUpdateResult = typeof TicketUpdateResult.Type

export const TicketCounts = Schema.Struct({
  total: Schema.Finite,
  byStatus: Schema.Record(TicketStatus, Schema.Finite)
})
export type TicketCounts = typeof TicketCounts.Type

export const TicketFacetField = Schema.Literals([
  "type",
  "tags",
  "assignee",
  "estimate",
  "sprint"
])
export type TicketFacetField = typeof TicketFacetField.Type

export const TicketFacetCounts = Schema.Record(Schema.String, Schema.Finite)
export type TicketFacetCounts = typeof TicketFacetCounts.Type

export const TicketCountQuery = TicketFilter.pipe(
  Schema.fieldsAssign({ q: Schema.optional(Schema.String) })
)
export type TicketCountQuery = typeof TicketCountQuery.Type

export const TicketCountQueryCompatibility = Schema.Struct({
  ...TicketFilterInput.fields,
  q: TicketCountQuery.fields.q
}).pipe(
  Schema.check(validTicketFilterInput),
  Schema.decodeTo(
    Schema.toType(TicketCountQuery),
    SchemaTransformation.transform({
      decode: (input): TicketCountQuery => ({
        ...ticketFilterFromInput(input),
        q: input.q
      }),
      encode: (query: TicketCountQuery) => query
    })
  )
)

export const TicketSearchQuery = Schema.Struct({
  q: Schema.optional(Schema.String),
  excludeGroupId: Schema.optional(GroupId),
  attachableTo: Schema.optional(TicketId),
  limit: Schema.optional(
    Schema.FiniteFromString.pipe(
      Schema.check(Schema.isInt()),
      Schema.check(Schema.isBetween({ minimum: 1, maximum: 100 }))
    )
  )
})
export type TicketSearchQuery = typeof TicketSearchQuery.Type

export const TicketSections = Schema.Struct({
  counts: TicketCounts,
  sections: Schema.Record(TicketStatus, TicketListPage)
})
export type TicketSections = typeof TicketSections.Type

export const SprintSectionUnscheduled = Schema.Literal("unscheduled")
export type SprintSectionUnscheduled = typeof SprintSectionUnscheduled.Type

export const SPRINT_SECTION_UNSCHEDULED: SprintSectionUnscheduled =
  "unscheduled"

export const SprintSectionKey = Schema.Union([
  GroupId,
  SprintSectionUnscheduled
])
export type SprintSectionKey = typeof SprintSectionKey.Type

export const sprintSectionKey = (groupId: GroupId | null): SprintSectionKey =>
  groupId === null ? SPRINT_SECTION_UNSCHEDULED : groupId

export const TicketSprintSection = Schema.Struct({
  key: SprintSectionKey,
  count: Schema.Finite,
  page: TicketListPage,
  estimates: Schema.NullOr(EstimateSummary).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(null))
  )
})
export type TicketSprintSection = typeof TicketSprintSection.Type

export const TicketSprintSections = Schema.Struct({
  total: Schema.Finite,
  counts: TicketCounts,
  sections: Schema.Array(TicketSprintSection)
})
export type TicketSprintSections = typeof TicketSprintSections.Type

export const EPIC_SECTION_NONE = "none" as const

export const EpicSectionKey = ParentFilter
export type EpicSectionKey = typeof EpicSectionKey.Type

export const TicketEpicSection = Schema.Struct({
  key: EpicSectionKey,
  parent: Schema.NullOr(TicketParent),
  count: Schema.Finite,
  page: TicketListPage
})
export type TicketEpicSection = typeof TicketEpicSection.Type

export const TicketEpicSections = Schema.Struct({
  total: Schema.Finite,
  counts: TicketCounts,
  sections: Schema.Array(TicketEpicSection)
})
export type TicketEpicSections = typeof TicketEpicSections.Type

export const BacklogGrouping = Schema.Literals([
  "status",
  "sprint",
  "epic",
  "parent"
])
export type BacklogGrouping = typeof BacklogGrouping.Type

export const TicketViewSource = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("sections"),
    grouping: BacklogGrouping,
    query: TicketListQuery
  }),
  Schema.Struct({
    kind: Schema.Literal("sprintBoard"),
    groupId: GroupId,
    query: TicketListQuery
  })
])
export type TicketViewSource = typeof TicketViewSource.Type

export const TicketViewSourceCompatibility = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("sections"),
    grouping: BacklogGrouping,
    query: TicketListQueryCompatibility
  }),
  Schema.Struct({
    kind: Schema.Literal("sprintBoard"),
    groupId: GroupId,
    query: TicketListQueryCompatibility
  })
])

export const TicketNeighbor = Schema.Struct({
  id: Ticket.fields.id,
  title: Ticket.fields.title
})
export type TicketNeighbor = typeof TicketNeighbor.Type

export const TicketNeighbors = Schema.Struct({
  prev: Schema.NullOr(TicketNeighbor),
  next: Schema.NullOr(TicketNeighbor),
  position: Schema.Finite,
  total: Schema.Finite
})
export type TicketNeighbors = typeof TicketNeighbors.Type
