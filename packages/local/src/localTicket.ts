import {
  EMPTY_TICKET_RELATIONS,
  type GitRepository,
  type LinkedTicket,
  TicketFact,
  TicketId,
  TicketListQuery,
  TicketStatus
} from "@pp/shared"
import { and, eq, or } from "drizzle-orm"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { LocalDb } from "./LocalDb"
import type { LocalTicket } from "./LocalRpcs"
import { sectionPage } from "./sections"
import {
  localRelations,
  localStatuses,
  localTicketData,
  localTickets
} from "./tables"
import { decodeStatus, finishedStatuses, toTicket } from "./ticketRows"

const decodeFact = Schema.decodeUnknownSync(Schema.fromJsonString(TicketFact))
const byId = Schema.decodeUnknownSync(TicketListQuery)({
  sort: { key: "id", dir: "asc" }
})

const byLinkedId = (a: LinkedTicket, b: LinkedTicket) =>
  a.id.localeCompare(b.id, undefined, { numeric: true })

export const localTicket = (
  copy: number,
  id: string,
  repository: (repoId: string | null) => GitRepository | null
) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const finished = finishedStatuses(
      (yield* db
        .select({ data: localStatuses.data })
        .from(localStatuses)
        .where(eq(localStatuses.copy, copy))).map((row) =>
        decodeStatus(row.data)
      )
    )
    const rowOf = (ticketId: string) =>
      Effect.map(
        sectionPage(
          db,
          copy,
          eq(localTickets.id, ticketId),
          undefined,
          byId,
          finished,
          1
        ),
        (rows) => rows[0] ?? null
      )
    const row = yield* rowOf(id)
    if (row === null) return null
    const ticket = toTicket(row, repository)
    const parent =
      ticket.parent === null ? null : yield* rowOf(ticket.parent.id)
    const edges = yield* db
      .select({
        from: localRelations.fromId,
        to: localRelations.toId,
        kind: localRelations.kind
      })
      .from(localRelations)
      .where(
        and(
          eq(localRelations.copy, copy),
          or(eq(localRelations.fromId, id), eq(localRelations.toId, id))
        )
      )
    const linked = yield* linkedTickets(
      copy,
      edges.map((edge) => (edge.from === id ? edge.to : edge.from))
    )
    const pick = (direction: "out" | "in", kind: string) =>
      edges
        .flatMap((edge) => {
          if (edge.kind !== kind) return []
          if ((edge.from === id) !== (direction === "out")) return []
          const other = linked.get(direction === "out" ? edge.to : edge.from)
          return other === undefined ? [] : [other]
        })
        .toSorted(byLinkedId)
    const related = new Map(
      edges.flatMap((edge) => {
        if (edge.kind !== "related") return []
        const other = linked.get(edge.from === id ? edge.to : edge.from)
        return other === undefined ? [] : [[other.id, other] as const]
      })
    )
    return {
      ticket,
      relations: {
        ...EMPTY_TICKET_RELATIONS,
        blockedBy: pick("out", "blocked_by"),
        blocking: pick("in", "blocked_by"),
        related: [...related.values()].toSorted(byLinkedId),
        duplicateOf: pick("out", "duplicate_of")[0] ?? null,
        duplicates: pick("in", "duplicate_of")
      },
      parentState:
        parent === null
          ? null
          : {
              status: TicketStatus.make(decodeFact(parent.data).status),
              subTicketCount: parent.subTicketCount,
              subTicketDoneCount: parent.subTicketDoneCount
            }
    } satisfies LocalTicket
  })

const linkedTickets = (copy: number, ids: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const linked = new Map<string, LinkedTicket>()
    for (const id of new Set(ids)) {
      const [row] = yield* db
        .select({ data: localTicketData.data })
        .from(localTicketData)
        .where(and(eq(localTicketData.copy, copy), eq(localTicketData.id, id)))
      if (row === undefined) continue
      const fact = decodeFact(row.data)
      linked.set(id, {
        id: TicketId.make(fact.id),
        title: fact.title,
        status: TicketStatus.make(fact.status),
        archivedAt: fact.archivedAt
      })
    }
    return linked
  })
