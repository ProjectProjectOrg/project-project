// Thin handlers for the `tickets` HttpApi group. All logic in Tickets.

import { Tickets } from "@pp/server-core/tickets/Tickets"
import { AppApi, Validation } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import { dieOnMarkdown } from "./lib"

export const TicketsHandlerLive = HttpApiBuilder.group(
  AppApi,
  "tickets",
  (handlers) =>
    handlers
      .handle("mine", ({ query }) =>
        Effect.flatMap(Tickets, (tickets) => tickets.mine(query)).pipe(
          dieOnMarkdown
        )
      )
      .handle("mineByProject", () =>
        Effect.flatMap(Tickets, (tickets) => tickets.mineByProject()).pipe(
          dieOnMarkdown
        )
      )
      .handle("recent", () =>
        Effect.flatMap(Tickets, (tickets) => tickets.recent()).pipe(
          dieOnMarkdown
        )
      )
      .handle("sections", ({ query }) =>
        Effect.flatMap(Tickets, (tickets) => tickets.sections(query)).pipe(
          dieOnMarkdown
        )
      )
      .handle("sprintSections", ({ query }) =>
        Effect.flatMap(Tickets, (tickets) =>
          tickets.sprintSections(query)
        ).pipe(dieOnMarkdown)
      )
      .handle("list", ({ query }) =>
        Effect.flatMap(Tickets, (tickets) => tickets.list(query)).pipe(
          dieOnMarkdown
        )
      )
      .handle("search", ({ query }) =>
        Effect.flatMap(Tickets, (tickets) => tickets.search(query)).pipe(
          dieOnMarkdown
        )
      )
      .handle("count", ({ query }) =>
        Effect.flatMap(Tickets, (tickets) => tickets.count(query)).pipe(
          dieOnMarkdown
        )
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
      .handle("get", ({ params }) =>
        Effect.flatMap(Tickets, (tickets) => tickets.get(params.id)).pipe(
          dieOnMarkdown
        )
      )
      .handle("update", ({ params, payload, query }) =>
        Effect.flatMap(Tickets, (tickets) =>
          tickets.update(params.id, payload, query.sort)
        ).pipe(dieOnMarkdown)
      )
      .handle("delete", ({ params }) =>
        Effect.flatMap(Tickets, (tickets) => tickets.remove(params.id)).pipe(
          dieOnMarkdown
        )
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
)
