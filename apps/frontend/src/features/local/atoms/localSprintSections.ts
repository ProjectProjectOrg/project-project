import { TICKET_LIST_LIMIT } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import * as Stream from "effect/Stream"

import { currentUserId } from "@/features/auth/atoms/auth"
import { project, projectRequest } from "@/features/projects/atoms/projects"
import { sprintLoadedPages } from "@/features/tickets/atoms/sprintPages"
import type { SprintSectionsRequest } from "@/features/tickets/atoms/sprintSections"

import { LocalClient } from "../lib/localClient"
import { repositories } from "./localBacklog"
import { localReady, localRuntime } from "./localProject"

export const localSprintSections = Atom.family((req: SprintSectionsRequest) =>
  localRuntime.atom((get) => {
    const ready = get(localReady(req.params))
    if (ready === undefined) return Stream.never
    if (!ready) return Stream.make(null)
    const detail = get(
      project(projectRequest(req.params.orgSlug, req.params.slug))
    )
    if (!AsyncResult.isSuccess(detail)) return Stream.never
    const loaded = get(sprintLoadedPages(req))
    return Stream.unwrap(
      Effect.map(LocalClient, (client) =>
        client.SprintSections({
          project: req.params,
          query: req.query,
          viewerId: get(currentUserId),
          estimation: detail.value.estimation,
          repositories: repositories(detail.value),
          limits: Object.fromEntries(
            Object.entries(loaded).map(([key, pages]) => [
              key,
              TICKET_LIST_LIMIT * (1 + pages)
            ])
          ),
          defaultLimit: TICKET_LIST_LIMIT
        })
      )
    )
  })
)
