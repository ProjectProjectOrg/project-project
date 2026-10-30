// Thin handlers for the `tickets` HttpApi group. All logic in Tickets.

import * as TicketQueries from "@pp/server-core/tickets/TicketQueries"
import { Tickets } from "@pp/server-core/tickets/Tickets"
import { AppApi, Validation } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/http-api"

import { dieOnMarkdown } from "./lib"

export const TicketsHandlerLive = HttpApiBuilder.group(
  AppApi,
  "tickets",
  (handlers) =>
    handlers
      .handle("mine", ({ query }) =>
        Effect.flatMap(TicketQueries.TicketQueries, (queries) =>
          queries.mine(query)
        ).pipe(dieOnMarkdown)
      )
      .handle("mineByProject", () =>
        Effect.flatMap(TicketQueries.TicketQueries, (queries) =>
          queries.mineByProject()
        ).pipe(dieOnMarkdown)
      )
      .handle("recent", () =>
        Effect.flatMap(TicketQueries.TicketQueries, (queries) =>
          queries.recent()
        ).pipe(dieOnMarkdown)
      )
      .handle("sections", ({ query }) =>
        Effect.flatMap(TicketQueries.TicketQueries, (queries) =>
          queries.sections(query)
        ).pipe(dieOnMarkdown)
      )
      .handle("sprintSections", ({ query }) =>
        Effect.flatMap(TicketQueries.TicketQueries, (queries) =>
          queries.sprintSections(query)
        ).pipe(dieOnMarkdown)
      )
      .handle("epicSections", ({ query }) =>
        Effect.flatMap(TicketQueries.TicketQueries, (queries) =>
          queries.epicSections(query)
        ).pipe(dieOnMarkdown)
      )
      .handle("list", ({ query }) =>
        Effect.flatMap(TicketQueries.TicketQueries, (queries) =>
          queries.list(query)
        ).pipe(dieOnMarkdown)
      )
      .handle("search", ({ query }) =>
        Effect.flatMap(TicketQueries.TicketQueries, (queries) =>
          queries.search(query)
        ).pipe(dieOnMarkdown)
      )
      .handle("count", ({ query }) =>
        Effect.flatMap(TicketQueries.TicketQueries, (queries) =>
          queries.count(query)
        ).pipe(dieOnMarkdown)
      )
      .handle("quickCreate", ({ payload }) =>
        Effect.flatMap(Tickets, (tickets) => tickets.quickCreate(payload)).pipe(
          dieOnMarkdown
        )
      )
      .handle("create", ({ payload }) =>
        Effect.flatMap(Tickets, (tickets) => tickets.create(payload)).pipe(
          dieOnMarkdown
        )
      )
      .handle("clearStaleEstimates", () =>
        Effect.flatMap(Tickets, (tickets) =>
          tickets.clearStaleEstimates()
        ).pipe(dieOnMarkdown)
      )
      .handle("get", ({ params }) =>
        Effect.flatMap(TicketQueries.TicketQueries, (queries) =>
          queries.get(params.id)
        ).pipe(dieOnMarkdown)
      )
      .handle("update", ({ params, payload, query }) =>
        Effect.flatMap(Tickets, (tickets) =>
          tickets.update(params.id, payload, query.sort)
        ).pipe(dieOnMarkdown, Effect.catchTag("Conflict", Effect.die))
      )
      .handle("bulkUpdate", ({ payload }) =>
        Effect.flatMap(Tickets, (tickets) => tickets.bulkUpdate(payload)).pipe(
          dieOnMarkdown
        )
      )
      .handle("delete", ({ params, query }) =>
        Effect.flatMap(Tickets, (tickets) =>
          tickets.remove(params.id, query)
        ).pipe(dieOnMarkdown)
      )
      .handle("split", ({ params, payload }) =>
        Effect.flatMap(Tickets, (tickets) =>
          tickets.split(params.id, payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("archive", ({ params, payload }) =>
        Effect.flatMap(Tickets, (tickets) =>
          tickets.archive(params.id, payload.reason)
        ).pipe(
          Effect.catchTag("InvalidCommentBody", (error) =>
            Effect.fail(new Validation({ reason: error.reason }))
          ),
          dieOnMarkdown
        )
      )
      .handle("unarchive", ({ params }) =>
        Effect.flatMap(Tickets, (tickets) => tickets.unarchive(params.id)).pipe(
          dieOnMarkdown
        )
      )
      .handle("createBranch", ({ params, payload }) =>
        Effect.flatMap(Tickets, (tickets) =>
          tickets.createBranch(params.id, payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("openPr", ({ params, payload }) =>
        Effect.flatMap(Tickets, (tickets) =>
          tickets.openPr(params.id, payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("clearBranch", ({ params }) =>
        Effect.flatMap(Tickets, (tickets) =>
          tickets.clearBranch(params.id)
        ).pipe(dieOnMarkdown)
      )
      .handle("attachBranch", ({ params, payload }) =>
        Effect.flatMap(Tickets, (tickets) =>
          tickets.attachBranch(params.id, payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("stackBranch", ({ params, payload }) =>
        Effect.flatMap(Tickets, (tickets) =>
          tickets.stackBranch(params.id, payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("unstackBranch", ({ params, payload }) =>
        Effect.flatMap(Tickets, (tickets) =>
          tickets.unstackBranch(params.id, payload)
        ).pipe(dieOnMarkdown)
      )
)
