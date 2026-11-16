import type { TicketSort } from "@pp/shared"
import {
  integer,
  primaryKey,
  type SQLiteColumn,
  sqliteTable,
  text
} from "drizzle-orm/sqlite-core"

const factTable = <const Name extends string>(name: Name) =>
  sqliteTable(
    name,
    {
      copy: integer("copy").notNull(),
      id: text("id").notNull(),
      data: text("data").notNull()
    },
    (t) => [primaryKey({ columns: [t.copy, t.id] })]
  )

export const localGroups = factTable("local_groups")
export const localStatuses = factTable("local_statuses")
export const localTags = factTable("local_tags")
export const localMembers = factTable("local_members")

export const localTickets = sqliteTable(
  "local_tickets",
  {
    copy: integer("copy").notNull(),
    id: text("id").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull(),
    type: text("type"),
    parent: text("parent"),
    archived: integer("archived").notNull(),
    flagged: integer("flagged").notNull(),
    hasBranch: integer("has_branch").notNull(),
    hasPr: integer("has_pr").notNull(),
    estimateUnit: text("estimate_unit"),
    estimateSize: text("estimate_size"),
    updatedAt: text("updated_at").notNull(),
    orderManual: text("order_manual").notNull(),
    orderId: text("order_id").notNull(),
    orderCreated: text("order_created").notNull(),
    orderUpdated: text("order_updated").notNull(),
    orderTitle: text("order_title").notNull(),
    orderPriority: text("order_priority").notNull(),
    orderEstimate: text("order_estimate").notNull()
  },
  (t) => [primaryKey({ columns: [t.copy, t.id] })]
)

export const localTicketData = sqliteTable(
  "local_ticket_data",
  {
    copy: integer("copy").notNull(),
    id: text("id").notNull(),
    data: text("data").notNull()
  },
  (t) => [primaryKey({ columns: [t.copy, t.id] })]
)

export const SORT_KEYS = [
  "manual",
  "id",
  "created",
  "updated",
  "title",
  "priority",
  "estimate"
] as const satisfies ReadonlyArray<TicketSort["key"]>

export type LocalSortKey = (typeof SORT_KEYS)[number]

export const orderColumns = {
  manual: localTickets.orderManual,
  id: localTickets.orderId,
  created: localTickets.orderCreated,
  updated: localTickets.orderUpdated,
  title: localTickets.orderTitle,
  priority: localTickets.orderPriority,
  estimate: localTickets.orderEstimate
} satisfies Record<LocalSortKey, SQLiteColumn>

export const localTicketAssignees = sqliteTable(
  "local_ticket_assignees",
  {
    copy: integer("copy").notNull(),
    ticket: text("ticket").notNull(),
    userId: text("user_id").notNull()
  },
  (t) => [primaryKey({ columns: [t.copy, t.ticket, t.userId] })]
)

export const localTicketTags = sqliteTable(
  "local_ticket_tags",
  {
    copy: integer("copy").notNull(),
    ticket: text("ticket").notNull(),
    tag: text("tag").notNull()
  },
  (t) => [primaryKey({ columns: [t.copy, t.ticket, t.tag] })]
)

export const localRelations = sqliteTable(
  "local_relations",
  {
    copy: integer("copy").notNull(),
    fromId: text("from_id").notNull(),
    toId: text("to_id").notNull(),
    kind: text("kind").notNull()
  },
  (t) => [primaryKey({ columns: [t.copy, t.fromId, t.toId, t.kind] })]
)

export const localGroupMembers = sqliteTable(
  "local_group_members",
  {
    copy: integer("copy").notNull(),
    groupId: text("group_id").notNull(),
    ticket: text("ticket").notNull(),
    position: integer("position").notNull()
  },
  (t) => [primaryKey({ columns: [t.copy, t.groupId, t.ticket] })]
)

export const localProjects = sqliteTable("local_projects", {
  copy: integer("copy").primaryKey(),
  data: text("data").notNull()
})

export const localCopies = sqliteTable("local_copies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  scope: text("scope").notNull()
})

export const localSync = sqliteTable("local_sync", {
  scope: text("scope").primaryKey(),
  copy: integer("copy").notNull(),
  cursor: text("cursor").notNull(),
  git: integer("git").notNull()
})

export const localStaging = sqliteTable("local_staging", {
  scope: text("scope").primaryKey(),
  copy: integer("copy").notNull(),
  base: text("base").notNull(),
  next: text("next"),
  git: integer("git").notNull()
})

export const localPendingOps = sqliteTable("local_pending_ops", {
  seq: integer("seq").primaryKey({ autoIncrement: true }),
  id: text("id").notNull().unique(),
  scope: text("scope").notNull(),
  tickets: text("tickets").notNull(),
  edits: text("edits").notNull(),
  write: text("write").notNull(),
  receipt: text("receipt")
})

export const localPendingBase = sqliteTable(
  "local_pending_base",
  {
    copy: integer("copy").notNull(),
    id: text("id").notNull(),
    data: text("data").notNull(),
    groups: text("groups").notNull()
  },
  (t) => [primaryKey({ columns: [t.copy, t.id] })]
)
