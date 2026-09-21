import * as Schema from "effect/Schema"
import * as Effect from "effect/Effect"
import { TicketStatus, TicketType } from "../schemas/Ticket"
import { TagName } from "../schemas/Tag"
import { GroupId } from "../schemas/Group"
import { Ticket, TicketDetail } from "../schemas/Ticket"
import { UserId } from "../schemas/User"
import { Page } from "../Pagination"

export const SortKey = Schema.Literals([
  "id",
  "created",
  "updated",
  "title",
  "priority"
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
  priority: "desc"
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

const TicketFilterFields = {
  status: Schema.optional(Schema.Array(TicketStatus)),
  type: Schema.optional(Schema.Array(TicketType)),
  assignee: Schema.optional(Schema.Array(AssigneeFilter)),
  tags: Schema.optional(Schema.Array(TagName)),
  hasBranch: Schema.optional(Schema.Boolean),
  hasPr: Schema.optional(Schema.Boolean),
  updatedAfter: Schema.optional(Schema.DateFromString),
  groupId: Schema.optional(Schema.Array(GroupIdFilter)),
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

export const TicketListRow = Schema.Struct({
  ticket: Ticket,
  orderKey: Schema.String
})
export type TicketListRow = typeof TicketListRow.Type

export const TicketListPage = Page(TicketListRow)
export type TicketListPage = typeof TicketListPage.Type

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
  page: TicketListPage
})
export type TicketSprintSection = typeof TicketSprintSection.Type

export const TicketSprintSections = Schema.Struct({
  total: Schema.Finite,
  sections: Schema.Array(TicketSprintSection)
})
export type TicketSprintSections = typeof TicketSprintSections.Type
