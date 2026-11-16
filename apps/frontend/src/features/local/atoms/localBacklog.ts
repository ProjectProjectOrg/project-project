import { type LocalRepositories, sectionDifferences } from "@pp/local"
import { TICKET_LIST_LIMIT } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import * as Stream from "effect/Stream"

import { Api } from "@/api/Api"
import { projectScope } from "@/api/keys"
import { currentUserId } from "@/features/auth/atoms/auth"
import { connectedRepos } from "@/features/github/lib/repos"
import { project, projectRequest } from "@/features/projects/atoms/projects"
import type {
  BacklogRequest,
  BacklogValue
} from "@/features/tickets/atoms/backlog"
import { backlogLoadedPages } from "@/features/tickets/atoms/backlogPages"
import type { CountsRequest } from "@/features/tickets/atoms/ticketCounts"
import { createdKeys } from "@/features/tickets/atoms/ticketRows"
import { toRow, withCreatedKeys } from "@/features/tickets/lib/ticketRows"

import { LocalClient } from "../lib/localClient"
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

type ProjectRepos = Parameters<typeof connectedRepos>[0]

const repository = (
  repo: NonNullable<ProjectRepos["github"]>
): LocalRepositories["byId"][string] => ({
  repoOwner: repo.repoOwner,
  repoName: repo.repoName,
  defaultBaseBranch: repo.defaultBaseBranch
})

const repositories = (detail: ProjectRepos): LocalRepositories => ({
  fallback: detail.github === null ? null : repository(detail.github),
  byId: Object.fromEntries(
    connectedRepos(detail).map((repo) => [repo.repoId, repository(repo)])
  )
})

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
    return Stream.unwrap(
      Effect.map(LocalClient, (client) =>
        client
          .Sections({
            project: req.params,
            query: req.query,
            viewerId: get(currentUserId),
            estimation: detail.value.estimation,
            repositories: repositories(detail.value),
            limits: Object.fromEntries(
              Object.entries(loaded).map(([status, pages]) => [
                status,
                TICKET_LIST_LIMIT * (1 + pages)
              ])
            ),
            defaultLimit: TICKET_LIST_LIMIT
          })
          .pipe(
            Stream.zipWithIndex,
            Stream.tap(([value, index]) =>
              index === 0 && value !== null && localShadowChecks()
                ? Effect.forkDetach(compareWithServer(req, value))
                : Effect.void
            ),
            Stream.map(([value]): BacklogValue | null =>
              value === null
                ? null
                : {
                    counts: value.counts,
                    sections: Object.fromEntries(
                      Object.entries(value.sections).map(([key, page]) => [
                        key,
                        {
                          items: withCreatedKeys(
                            page.items.map(toRow),
                            created
                          ),
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
    return Stream.unwrap(
      Effect.map(LocalClient, (client) =>
        client.Counts({
          project: req.params,
          query: req.query,
          viewerId: get(currentUserId),
          estimation: detail.value.estimation
        })
      )
    )
  })
)
