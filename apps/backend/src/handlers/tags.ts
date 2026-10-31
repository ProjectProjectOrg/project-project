import { Tags } from "@pp/server-core/tags/Tags"
import * as TicketQueries from "@pp/server-core/tickets/TicketQueries"
import { AppApi } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/http-api"

import { dieOnMarkdown } from "./lib"

export const TagsHandlerLive = HttpApiBuilder.group(
  AppApi,
  "tags",
  (handlers) =>
    handlers
      .handle("list", () =>
        Effect.flatMap(Tags, (tags) => tags.list()).pipe(dieOnMarkdown)
      )
      .handle("usageCounts", () =>
        Effect.flatMap(TicketQueries.TicketQueries, (queries) =>
          queries.tagUsageCounts()
        ).pipe(dieOnMarkdown)
      )
      .handle("create", ({ payload }) =>
        Effect.flatMap(Tags, (tags) => tags.create(payload)).pipe(dieOnMarkdown)
      )
      .handle("update", ({ params, payload }) =>
        Effect.flatMap(Tags, (tags) => tags.update(params.name, payload)).pipe(
          dieOnMarkdown
        )
      )
      .handle("delete", ({ params }) =>
        Effect.flatMap(Tags, (tags) => tags.remove(params.name)).pipe(
          dieOnMarkdown
        )
      )
)
