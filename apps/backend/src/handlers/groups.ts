import { Groups } from "@pp/server-core/groups/Groups"
import * as TicketCommands from "@pp/server-core/tickets/TicketCommands"
import * as TicketQueries from "@pp/server-core/tickets/TicketQueries"
import { AppApi } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/http-api"

import { dieOnMarkdown } from "./lib"

export const GroupsHandlerLive = HttpApiBuilder.group(
  AppApi,
  "groups",
  (handlers) =>
    handlers
      .handle("list", () =>
        Effect.flatMap(Groups, (groups) => groups.list()).pipe(dieOnMarkdown)
      )
      .handle("create", ({ payload }) =>
        Effect.flatMap(Groups, (groups) => groups.create(payload)).pipe(
          dieOnMarkdown
        )
      )
      .handle("get", ({ params }) =>
        Effect.flatMap(Groups, (groups) => groups.get(params.id)).pipe(
          dieOnMarkdown
        )
      )
      .handle("listTickets", ({ params }) =>
        Effect.flatMap(TicketQueries.TicketQueries, (queries) =>
          queries.listInGroup(params.id)
        ).pipe(dieOnMarkdown)
      )
      .handle("update", ({ params, payload }) =>
        Effect.flatMap(Groups, (groups) =>
          groups.update(params.id, payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("updateTickets", ({ params, payload }) =>
        Effect.flatMap(Groups, (groups) =>
          groups.updateTickets(params.id, payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("addTickets", ({ params, payload }) =>
        Effect.flatMap(Groups, (groups) =>
          groups.addTickets(params.id, payload.tickets)
        ).pipe(dieOnMarkdown)
      )
      .handle("removeTickets", ({ params, payload }) =>
        Effect.flatMap(Groups, (groups) =>
          groups.removeTickets(params.id, payload.tickets)
        ).pipe(dieOnMarkdown)
      )
      .handle("updateTicketOrder", ({ params, payload }) =>
        Effect.flatMap(TicketCommands.TicketCommands, (commands) =>
          commands.moveInGroup(params.id, payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("complete", ({ params, payload }) =>
        Effect.flatMap(Groups, (groups) =>
          groups.complete(params.id, payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("delete", ({ params }) =>
        Effect.flatMap(Groups, (groups) => groups.remove(params.id)).pipe(
          dieOnMarkdown
        )
      )
)
