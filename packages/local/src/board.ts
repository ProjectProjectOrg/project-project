import {
  DEFAULT_TICKET_SORT,
  type GitRepository,
  GroupHeader,
  type Ticket
} from "@pp/shared"
import { and, asc, eq } from "drizzle-orm"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { LocalDb } from "./LocalDb"
import { inList, sectionPage } from "./sections"
import { localGroupMembers, localGroups, localTickets } from "./tables"
import { statusesOf } from "./ticketList"
import { finishedStatuses, toTicket } from "./ticketRows"

const decodeHeader = Schema.decodeUnknownSync(
  Schema.fromJsonString(GroupHeader)
)

export const groupOf = (copy: number, groupId: string) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const [row] = yield* db
      .select({ data: localGroups.data })
      .from(localGroups)
      .where(and(eq(localGroups.copy, copy), eq(localGroups.id, groupId)))
    if (row === undefined) return null
    const members = yield* db
      .select({ ticket: localGroupMembers.ticket })
      .from(localGroupMembers)
      .where(
        and(
          eq(localGroupMembers.copy, copy),
          eq(localGroupMembers.groupId, groupId)
        )
      )
      .orderBy(asc(localGroupMembers.position))
    return {
      header: decodeHeader(row.data),
      tickets: members.map((member) => member.ticket)
    }
  })

export type LocalSprintBoardRequest = Readonly<{
  copy: number
  groupId: string
  repository: (repoId: string | null) => GitRepository | null
}>

export const localSprintBoard = (request: LocalSprintBoardRequest) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const group = yield* groupOf(request.copy, request.groupId)
    if (group === null) return null
    const rows = yield* sectionPage(
      db,
      request.copy,
      inList(group.tickets),
      eq(localTickets.archived, 0),
      { sort: DEFAULT_TICKET_SORT },
      finishedStatuses(yield* statusesOf(request.copy)),
      -1
    )
    return {
      tickets: rows.map((row): Ticket => toTicket(row, request.repository)),
      completedAt: group.header.completedAt
    }
  })
