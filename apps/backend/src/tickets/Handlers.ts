// Thin handlers for the `tickets` HttpApi group. All logic in TicketQueries, TicketCommands and TicketGit.

import * as TicketGit from "@pp/server-core/git/TicketGit"
import * as TicketCommands from "@pp/server-core/tickets/TicketCommands"
import * as TicketQueries from "@pp/server-core/tickets/TicketQueries"
import { AppApi, Validation } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/http-api"

import { dieOnMarkdown } from "../http/dieOnMarkdown"

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
      .handle("parentSections", ({ query }) =>
        Effect.flatMap(TicketQueries.TicketQueries, (queries) =>
          queries.parentSections(query)
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
      .handle("titles", () =>
        Effect.flatMap(TicketQueries.TicketQueries, (queries) =>
          queries.titles()
        ).pipe(dieOnMarkdown)
      )
      .handle("textSearch", ({ query }) =>
        Effect.flatMap(TicketQueries.TicketQueries, (queries) =>
          queries.textSearch(query)
        ).pipe(dieOnMarkdown)
      )
      .handle("count", ({ query }) =>
        Effect.flatMap(TicketQueries.TicketQueries, (queries) =>
          queries.count(query)
        ).pipe(dieOnMarkdown)
      )
      .handle("facets", ({ params, query }) =>
        Effect.flatMap(TicketQueries.TicketQueries, (queries) =>
          queries.facets(params.field, query)
        ).pipe(dieOnMarkdown)
      )
      .handle("quickCreate", ({ payload }) =>
        Effect.flatMap(TicketCommands.TicketCommands, (commands) =>
          commands.quickCreate(payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("create", ({ payload }) =>
        Effect.flatMap(TicketCommands.TicketCommands, (commands) =>
          commands.create(payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("clearStaleEstimates", () =>
        Effect.flatMap(TicketCommands.TicketCommands, (commands) =>
          commands.clearStaleEstimates()
        ).pipe(dieOnMarkdown)
      )
      .handle("get", ({ params }) =>
        Effect.flatMap(TicketQueries.TicketQueries, (queries) =>
          queries.get(params.id)
        ).pipe(dieOnMarkdown)
      )
      .handle("neighbors", ({ params, query }) =>
        Effect.flatMap(TicketQueries.TicketQueries, (queries) =>
          queries.neighbors(params.id, query.from)
        ).pipe(dieOnMarkdown)
      )
      .handle("update", ({ params, payload, query }) =>
        Effect.flatMap(TicketCommands.TicketCommands, (commands) =>
          commands.update(params.id, payload, query.sort)
        ).pipe(dieOnMarkdown, Effect.catchTag("Conflict", Effect.die))
      )
      .handle("bulkUpdate", ({ payload }) =>
        Effect.flatMap(TicketCommands.TicketCommands, (commands) =>
          commands.bulkUpdate(payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("delete", ({ params, query }) =>
        Effect.flatMap(TicketCommands.TicketCommands, (commands) =>
          commands.remove(params.id, query)
        ).pipe(dieOnMarkdown)
      )
      .handle("split", ({ params, payload }) =>
        Effect.flatMap(TicketCommands.TicketCommands, (commands) =>
          commands.split(params.id, payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("move", ({ params, payload }) =>
        Effect.flatMap(TicketCommands.TicketCommands, (commands) =>
          commands.move(params.id, payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("movedTo", ({ params }) =>
        Effect.flatMap(TicketQueries.TicketQueries, (queries) =>
          queries.movedTo(params.id)
        )
      )
      .handle("archive", ({ params, payload }) =>
        Effect.flatMap(TicketCommands.TicketCommands, (commands) =>
          commands.archive(params.id, payload)
        ).pipe(
          Effect.catchTag("InvalidCommentBody", (error) =>
            Effect.fail(new Validation({ reason: error.reason }))
          ),
          dieOnMarkdown
        )
      )
      .handle("mark", ({ params, payload }) =>
        Effect.flatMap(TicketCommands.TicketCommands, (commands) =>
          commands.mark(params.id, payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("unmark", ({ params, payload }) =>
        Effect.flatMap(TicketCommands.TicketCommands, (commands) =>
          commands.unmark(params.id, payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("unarchive", ({ params }) =>
        Effect.flatMap(TicketCommands.TicketCommands, (commands) =>
          commands.unarchive(params.id)
        ).pipe(dieOnMarkdown)
      )
      .handle("createBranch", ({ params, payload }) =>
        Effect.flatMap(TicketGit.TicketGit, (git) =>
          git.createBranch(params.id, payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("openPr", ({ params, payload }) =>
        Effect.flatMap(TicketGit.TicketGit, (git) =>
          git.openPr(params.id, payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("clearBranch", ({ params }) =>
        Effect.flatMap(TicketGit.TicketGit, (git) =>
          git.clearBranch(params.id)
        ).pipe(dieOnMarkdown)
      )
      .handle("attachBranch", ({ params, payload }) =>
        Effect.flatMap(TicketGit.TicketGit, (git) =>
          git.attachBranch(params.id, payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("stackBranch", ({ params, payload }) =>
        Effect.flatMap(TicketGit.TicketGit, (git) =>
          git.stackBranch(params.id, payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("unstackBranch", ({ params, payload }) =>
        Effect.flatMap(TicketGit.TicketGit, (git) =>
          git.unstackBranch(params.id, payload)
        ).pipe(dieOnMarkdown)
      )
)
