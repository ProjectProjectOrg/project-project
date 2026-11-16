import {
  LOCAL_SECTION_TABLES,
  localCounts as countLocally,
  localSections,
  sectionDifferences
} from "@pp/local"
import { TICKET_LIST_LIMIT } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import * as SqlClient from "effect/sql/SqlClient"
import * as Stream from "effect/Stream"

import { Api } from "@/api/Api"
import { projectScope } from "@/api/keys"
import { currentUserId } from "@/features/auth/atoms/auth"
import { ticketRepo } from "@/features/github/lib/repos"
import { project, projectRequest } from "@/features/projects/atoms/projects"
import type {
  BacklogRequest,
  BacklogValue
} from "@/features/tickets/atoms/backlog"
import { backlogLoadedPages } from "@/features/tickets/atoms/backlogPages"
import type { CountsRequest } from "@/features/tickets/atoms/ticketCounts"
import { createdKeys } from "@/features/tickets/atoms/ticketRows"
import { toRow, withCreatedKeys } from "@/features/tickets/lib/ticketRows"

import { localShadowChecks } from "../lib/localShadow"
import { localReady, localRuntime } from "./localProject"

const compareWithServer = (
  req: BacklogRequest,
  local: Parameters<typeof sectionDifferences>[0]
) =>
  Effect.gen(function* () {
    const api = yield* Api
    const server = yield* api.tickets.sections({
      params: req.params,
      query: req.query
    })
    const differing = sectionDifferences(local, server)
    const scope = projectScope(req.params.orgSlug, req.params.slug)
    return yield* differing.length === 0
      ? Effect.logInfo(`local sections of ${scope} match the server`)
      : Effect.logWarning(
          `local sections of ${scope} differ from the server`,
          differing
        )
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.logWarning("local sections shadow check failed", cause)
    )
  )

export const localBacklog = Atom.family((req: BacklogRequest) =>
  localRuntime.atom((get) => {
    const ready = get(localReady(req.params))
    if (ready === undefined) return Stream.never
    if (!ready) return Stream.make(null)
    const detail = get(
      project(projectRequest(req.params.orgSlug, req.params.slug))
    )
    if (!AsyncResult.isSuccess(detail)) return Stream.never
    const loaded = get(backlogLoadedPages(req))
    const scope = projectScope(req.params.orgSlug, req.params.slug)
    const created = get(createdKeys(scope))
    const sections = localSections({
      scope,
      query: req.query,
      viewerId: get(currentUserId),
      estimation: detail.value.estimation,
      repository: (repoId) => ticketRepo(detail.value, repoId),
      perStatus: (status) => TICKET_LIST_LIMIT * (1 + (loaded[status] ?? 0))
    })
    return Stream.unwrap(
      Effect.map(SqlClient.SqlClient, (sql) =>
        sql.reactive(LOCAL_SECTION_TABLES, sections).pipe(
          Stream.zipWithIndex,
          Stream.tap(([value, index]) =>
            index === 0 && value !== null && localShadowChecks()
              ? Effect.forkDetach(compareWithServer(req, value))
              : Effect.void
          ),
          Stream.map(([value]) => value),
          Stream.map((value): BacklogValue | null =>
            value === null
              ? null
              : {
                  counts: value.counts,
                  sections: Object.fromEntries(
                    Object.entries(value.sections).map(([key, page]) => [
                      key,
                      {
                        items: withCreatedKeys(page.items.map(toRow), created),
                        nextCursor: page.nextCursor
                      }
                    ])
                  )
                }
          )
        )
      )
    )
  })
)

export const localCounts = Atom.family((req: CountsRequest) =>
  localRuntime.atom((get) => {
    const ready = get(localReady(req.params))
    if (ready === undefined) return Stream.never
    if (!ready) return Stream.make(null)
    const detail = get(
      project(projectRequest(req.params.orgSlug, req.params.slug))
    )
    if (!AsyncResult.isSuccess(detail)) return Stream.never
    const counts = countLocally({
      scope: projectScope(req.params.orgSlug, req.params.slug),
      query: req.query,
      viewerId: get(currentUserId),
      estimation: detail.value.estimation
    })
    return Stream.unwrap(
      Effect.map(SqlClient.SqlClient, (sql) =>
        sql.reactive(LOCAL_SECTION_TABLES, counts)
      )
    )
  })
)
