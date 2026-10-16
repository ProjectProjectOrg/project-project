import * as Schema from "effect/Schema"

import { Estimate } from "./Estimate"
import { GroupKind } from "./Group"
import { GroupId } from "./GroupId"
import { TagName } from "./Tag"
import { TicketId, TicketPriority, TicketStatus, TicketType } from "./Ticket"
import { User, UserId } from "./User"

export const ActivitySystemSource = Schema.Literals([
  "github",
  "automation",
  "import"
])
export type ActivitySystemSource = typeof ActivitySystemSource.Type

export const ActivityCause = Schema.Literals([
  "status_removed",
  "tag_deleted",
  "member_removed",
  "sprint_completed",
  "group_deleted"
])
export type ActivityCause = typeof ActivityCause.Type

const valueChange = <K extends string, S extends Schema.Top>(
  kind: K,
  value: S
) => Schema.Struct({ kind: Schema.Literal(kind), from: value, to: value })

const listChange = <K extends string, S extends Schema.Top>(
  kind: K,
  value: S
) =>
  Schema.Struct({
    kind: Schema.Literal(kind),
    added: Schema.Array(value),
    removed: Schema.Array(value)
  })

const groupChange = <K extends string>(kind: K) =>
  Schema.Struct({
    kind: Schema.Literal(kind),
    groupId: GroupId,
    groupKind: GroupKind,
    name: Schema.String
  })

export const TicketActivityChange = Schema.Union([
  valueChange("title_changed", Schema.String),
  valueChange("status_changed", TicketStatus),
  valueChange("priority_changed", TicketPriority),
  valueChange("type_changed", TicketType),
  valueChange("estimate_changed", Schema.NullOr(Estimate)),
  listChange("assignees_changed", UserId),
  listChange("tags_changed", TagName),
  Schema.Struct({ kind: Schema.Literal("description_edited") }),
  Schema.Struct({ kind: Schema.Literal("archived") }),
  Schema.Struct({ kind: Schema.Literal("unarchived") }),
  Schema.Struct({
    kind: Schema.Literal("split"),
    into: Schema.Array(TicketId)
  }),
  groupChange("group_added"),
  groupChange("group_removed"),
  Schema.Struct({
    kind: Schema.Literal("branch_linked"),
    branch: Schema.String
  }),
  Schema.Struct({
    kind: Schema.Literal("branch_unlinked"),
    branch: Schema.String
  }),
  Schema.Struct({ kind: Schema.Literal("pr_opened"), number: Schema.Finite }),
  Schema.Struct({ kind: Schema.Literal("pr_merged"), number: Schema.Finite }),
  Schema.Struct({ kind: Schema.Literal("pr_closed"), number: Schema.Finite })
])
export type TicketActivityChange = typeof TicketActivityChange.Type
export type TicketActivityChangeEncoded = typeof TicketActivityChange.Encoded
export type TicketActivityKind = TicketActivityChange["kind"]

export const GIT_ACTIVITY_KINDS: ReadonlySet<TicketActivityKind> = new Set([
  "branch_linked",
  "branch_unlinked",
  "pr_opened",
  "pr_merged",
  "pr_closed"
])

export const TicketActivityActor = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("user"), user: User }),
  Schema.Struct({
    kind: Schema.Literal("agent"),
    user: User,
    client: Schema.Struct({ id: Schema.String, name: Schema.String })
  }),
  Schema.Struct({
    kind: Schema.Literal("system"),
    source: ActivitySystemSource
  })
])
export type TicketActivityActor = typeof TicketActivityActor.Type

export const TicketActivityEntry = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("change"),
    id: Schema.String,
    occurredAt: Schema.DateFromString,
    actor: TicketActivityActor,
    cause: Schema.NullOr(ActivityCause),
    change: TicketActivityChange
  }),
  Schema.Struct({
    kind: Schema.Literal("created"),
    id: Schema.Literal("created"),
    occurredAt: Schema.DateFromString,
    actor: Schema.NullOr(TicketActivityActor),
    splitFrom: Schema.NullOr(TicketId)
  })
])
export type TicketActivityEntry = typeof TicketActivityEntry.Type

export const TicketActivityPage = Schema.Struct({
  items: Schema.Array(TicketActivityEntry),
  people: Schema.Array(User),
  nextCursor: Schema.NullOr(Schema.String)
})
export type TicketActivityPage = typeof TicketActivityPage.Type

export const TICKET_ACTIVITY_PAGE_SIZE = 50
