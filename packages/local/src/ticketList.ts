import type {
  EstimationMode,
  GitRepository,
  TicketListQuery,
  TicketListRow
} from "@pp/shared"
import { and, eq } from "drizzle-orm"
import * as Effect from "effect/Effect"

import { compileFilter } from "./filter"
import { LocalDb } from "./LocalDb"
import type { LocalRepositories } from "./LocalRpcs"
import { readOrderKey } from "./orderKey"
import { sectionPage } from "./sections"
import { localStatuses } from "./tables"
import { decodeStatus, finishedStatuses, toTicket } from "./ticketRows"

export const statusesOf = (copy: number) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    return (yield* db
      .select({ data: localStatuses.data })
      .from(localStatuses)
      .where(eq(localStatuses.copy, copy))).map((row) => decodeStatus(row.data))
  })

export const repositoryFrom =
  (repositories: LocalRepositories) =>
  (repoId: string | null): GitRepository | null =>
    repoId === null
      ? repositories.fallback
      : (repositories.byId[repoId] ?? null)

export type LocalTicketListRequest = Readonly<{
  copy: number
  query: TicketListQuery
  viewerId: string | undefined
  estimation: EstimationMode
  repository: (repoId: string | null) => GitRepository | null
}>

export const localTicketList = (request: LocalTicketListRequest) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const finished = finishedStatuses(yield* statusesOf(request.copy))
    const conditions = compileFilter(db, request.query, {
      viewerId: request.viewerId,
      estimation: request.estimation,
      finished
    })
    if (conditions === null) return null
    const rows = yield* sectionPage(
      db,
      request.copy,
      undefined,
      and(...conditions),
      request.query,
      finished,
      -1
    )
    return rows.map(
      (row): TicketListRow => ({
        ticket: toTicket(row, request.repository),
        orderKey: readOrderKey(row.orderKey)
      })
    )
  })
