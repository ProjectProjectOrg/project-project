import {
  type EstimationMode,
  NO_TYPE_FILTER,
  type TicketCountQuery
} from "@pp/shared"
import {
  and,
  eq,
  exists,
  gt,
  inArray,
  isNotNull,
  isNull,
  ne,
  notExists,
  notInArray,
  or,
  type SQL,
  sql
} from "drizzle-orm"
import { alias, type AnySQLiteColumn } from "drizzle-orm/sqlite-core"

import type { LocalDb } from "./LocalDb"
import {
  localRelations,
  localTicketAssignees,
  localTickets,
  localTicketTags
} from "./tables"

const t = localTickets
export const never = sql`0`

const any = (conditions: ReadonlyArray<SQL | undefined>) => {
  const present = conditions.flatMap((c) => (c === undefined ? [] : [c]))
  return present.length === 0 ? never : (or(...present) ?? never)
}

const isAscii = (value: string) => /^[ -~]*$/u.test(value)

const escapeLike = (value: string) =>
  value.replaceAll(/[\\%_]/gu, (c) => `\\${c}`)

const typeOf = sql<string>`coalesce(${t.type}, ${NO_TYPE_FILTER})`

export const open = (
  ticket: Readonly<{ archived: AnySQLiteColumn; status: AnySQLiteColumn }>,
  finished: ReadonlyArray<string>
) =>
  and(
    eq(ticket.archived, 0),
    finished.length === 0 ? undefined : notInArray(ticket.status, [...finished])
  )

export type LocalQueryContext = Readonly<{
  viewerId: string | undefined
  estimation: EstimationMode
  finished: ReadonlyArray<string>
}>

export const compileFilter = (
  db: LocalDb["Service"],
  query: TicketCountQuery,
  context: LocalQueryContext
): ReadonlyArray<SQL | undefined> | null => {
  if ((query.groupId?.length ?? 0) > 0 || query.subTickets === "nested")
    return null
  const q = query.q?.trim().toLowerCase() ?? ""
  if (!isAscii(q)) return null
  const assignees = (users: ReadonlyArray<string>) =>
    db
      .select({ one: sql`1` })
      .from(localTicketAssignees)
      .where(
        and(
          eq(localTicketAssignees.copy, t.copy),
          eq(localTicketAssignees.ticket, t.id),
          users.length === 0
            ? undefined
            : inArray(localTicketAssignees.userId, [...users])
        )
      )
  const blocker = alias(localTickets, "blocker")
  const blockers = db
    .select({ one: sql`1` })
    .from(localRelations)
    .innerJoin(
      blocker,
      and(
        eq(blocker.copy, localRelations.copy),
        eq(blocker.id, localRelations.toId)
      )
    )
    .where(
      and(
        eq(localRelations.copy, t.copy),
        eq(localRelations.fromId, t.id),
        eq(localRelations.kind, "blocked_by"),
        open(blocker, context.finished)
      )
    )
  const mode = context.estimation
  const users = (query.assignee ?? []).flatMap((wanted) => {
    if (wanted === "unassigned") return []
    if (wanted !== "mine") return [wanted]
    return context.viewerId === undefined ? [] : [context.viewerId]
  })
  return [
    eq(t.archived, query.archived === true ? 1 : 0),
    query.status === undefined
      ? undefined
      : query.status.length === 0
        ? never
        : inArray(t.status, [...query.status]),
    query.type === undefined
      ? undefined
      : query.type.length === 0
        ? never
        : inArray(typeOf, [...query.type]),
    query.excludeType === undefined || query.excludeType.length === 0
      ? undefined
      : notInArray(typeOf, [...query.excludeType]),
    query.assignee === undefined
      ? undefined
      : any(
          [
            query.assignee.includes("unassigned")
              ? notExists(assignees([]))
              : undefined,
            users.length > 0 ? exists(assignees(users)) : undefined
          ].filter((c) => c !== undefined)
        ),
    query.tags === undefined
      ? undefined
      : query.tags.length === 0
        ? never
        : exists(
            db
              .select({ one: sql`1` })
              .from(localTicketTags)
              .where(
                and(
                  eq(localTicketTags.copy, t.copy),
                  eq(localTicketTags.ticket, t.id),
                  inArray(localTicketTags.tag, [...query.tags])
                )
              )
          ),
    query.hasBranch === undefined
      ? undefined
      : eq(t.hasBranch, query.hasBranch ? 1 : 0),
    query.hasPr === undefined ? undefined : eq(t.hasPr, query.hasPr ? 1 : 0),
    query.flagged === undefined
      ? undefined
      : eq(t.flagged, query.flagged ? 1 : 0),
    query.estimate === undefined
      ? undefined
      : any(
          query.estimate.map((value) => {
            switch (value) {
              case "none":
                return or(isNull(t.estimateUnit), ne(t.estimateUnit, mode))
              case "any":
                return eq(t.estimateUnit, mode)
              case "stale":
                return and(isNotNull(t.estimateUnit), ne(t.estimateUnit, mode))
              default:
                return mode === "tshirt"
                  ? and(eq(t.estimateUnit, "tshirt"), eq(t.estimateSize, value))
                  : never
            }
          })
        ),
    query.parent === undefined
      ? undefined
      : any(
          query.parent.map((wanted) =>
            wanted === "none" ? isNull(t.parent) : eq(t.parent, wanted)
          )
        ),
    query.updatedAfter === undefined
      ? undefined
      : gt(t.updatedAt, query.updatedAfter.toISOString()),
    query.blocked === undefined
      ? undefined
      : query.blocked
        ? exists(blockers)
        : notExists(blockers),
    q.length === 0
      ? undefined
      : or(
          sql`lower(${t.title}) like ${`%${escapeLike(q)}%`} escape '\\'`,
          sql`lower(${t.id}) like ${`%${escapeLike(q)}%`} escape '\\'`
        )
  ]
}
