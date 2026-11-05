import * as ProjectStatuses from "@pp/server-core/projects/ProjectStatuses"
import { AppApi } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/http-api"

import { dieOnMarkdown } from "../http/dieOnMarkdown"

export const StatusesHandlerLive = HttpApiBuilder.group(
  AppApi,
  "statuses",
  (handlers) =>
    handlers
      .handle("list", () =>
        Effect.flatMap(ProjectStatuses.ProjectStatuses, (statuses) =>
          statuses.list()
        ).pipe(dieOnMarkdown)
      )
      .handle("create", ({ payload }) =>
        Effect.flatMap(ProjectStatuses.ProjectStatuses, (statuses) =>
          statuses.create(payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("update", ({ params, payload }) =>
        Effect.flatMap(ProjectStatuses.ProjectStatuses, (statuses) =>
          statuses.update(params.statusSlug, payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("reorder", ({ params, payload }) =>
        Effect.flatMap(ProjectStatuses.ProjectStatuses, (statuses) =>
          statuses.reorder(params.statusSlug, payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("remove", ({ params, query }) =>
        Effect.flatMap(ProjectStatuses.ProjectStatuses, (statuses) =>
          statuses.remove(params.statusSlug, { reassignTo: query.reassignTo })
        ).pipe(dieOnMarkdown)
      )
)
