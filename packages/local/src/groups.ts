import { Group, GroupHeader, padNumericIdSort } from "@pp/shared"
import { eq } from "drizzle-orm"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { LocalDb } from "./LocalDb"
import { groupMembership } from "./sprints"
import { localGroups } from "./tables"

const decodeHeader = Schema.decodeUnknownSync(
  Schema.fromJsonString(GroupHeader)
)
const decodeGroup = Schema.decodeUnknownSync(Schema.toType(Group))

const idOrder = (id: string) => padNumericIdSort(id) ?? id

export const localGroupList = (copy: number) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const { ticketsOf } = yield* groupMembership(copy)
    const rows = yield* db
      .select({ data: localGroups.data })
      .from(localGroups)
      .where(eq(localGroups.copy, copy))
    return rows
      .map((row) => {
        const header = decodeHeader(row.data)
        return decodeGroup({
          ...header,
          tickets: ticketsOf.get(header.id) ?? []
        })
      })
      .toSorted(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() ||
          idOrder(a.id).localeCompare(idOrder(b.id))
      )
  })
