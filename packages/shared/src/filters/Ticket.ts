import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { Page } from "../Pagination"
import { EstimateFilterValue, EstimateSummary } from "../schemas/Estimate"
import { GroupId } from "../schemas/Group"
import { Slug } from "../schemas/Project"
import { TagName } from "../schemas/Tag"
import { TicketId, TicketStatus, TicketType } from "../schemas/Ticket"
import { Ticket, TicketDetail } from "../schemas/Ticket"
import { UserId } from "../schemas/User"

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

const TicketFilterFields = {
  status: Schema.optional(Schema.Array(TicketStatus)),
  type: Schema.optional(Schema.Array(TicketType)),
  assignee: Schema.optional(Schema.Array(AssigneeFilter)),
  tags: Schema.optional(Schema.Array(TagName)),
  hasBranch: Schema.optional(Schema.Boolean),
  hasPr: Schema.optional(Schema.Boolean),
  updatedAfter: Schema.optional(Schema.DateFromString),
  groupId: Schema.optional(Schema.Array(GroupIdFilter)),
  estimate: Schema.optional(Schema.Array(EstimateFilterValue)),
  parent: Schema.optional(Schema.Array(ParentFilter)),
  subTickets: Schema.optional(SubTicketsMode),
  archived: Schema.optional(Schema.Boolean)
} as const

export const TicketFilter = Schema.Struct(TicketFilterFields)
export type TicketFilter = typeof TicketFilter.Type

export const TICKET_LIST_LIMIT = 50

export const TicketListQuery = TicketFilter.pipe(
  Schema.fieldsAssign({
    sort: TicketSort.pipe(
      Schema.withDecodingDefaultType(Effect.succeed(DEFAULT_TICKET_SORT))
    ),
    q: Schema.optional(Schema.String),
    cursor: Schema.optional(Schema.String)
  })
)
export type TicketListQuery = typeof TicketListQuery.Type

export const TicketSection = Schema.Struct({
  status: TicketFilterFields.status,
  groupId: TicketFilterFields.groupId,
  parent: TicketFilterFields.parent
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
    actor: UserId,
    at: Schema.DateFromString
  }),
  Schema.Struct({
    tag: Schema.Literal("created"),
    actor: UserId,
    at: Schema.DateFromString
  }),
  Schema.Struct({
    tag: Schema.Literal("assigned"),
    actor: Schema.optional(UserId),
    at: Schema.optional(Schema.DateFromString)
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

export const TicketCountQuery = TicketFilter.pipe(
  Schema.fieldsAssign({ q: Schema.optional(Schema.String) })
)
export type TicketCountQuery = typeof TicketCountQuery.Type

export const TicketSearchQuery = Schema.Struct({
  q: Schema.optional(Schema.String),
  excludeGroupId: Schema.optional(GroupId),
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
  title: Schema.NullOr(Schema.String),
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
