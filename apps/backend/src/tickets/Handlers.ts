// Thin handlers for the `tickets` HttpApi group. All logic in TicketQueries, TicketCommands and TicketGit.

import * as Access from "@pp/server-core/access/Access"
import * as BetterAuth from "@pp/server-core/auth/BetterAuth"
import * as TicketGit from "@pp/server-core/git/TicketGit"
import * as TicketCommands from "@pp/server-core/tickets/TicketCommands"
import * as TicketQueries from "@pp/server-core/tickets/TicketQueries"
import {
  AppApi,
  CurrentUser,
  ProjectChange,
  ProjectScope,
  Unauthorized
} from "@pp/shared"
import * as Clock from "effect/Clock"
import * as Effect from "effect/Effect"
import { HttpServerRequest, HttpServerResponse } from "effect/http"
import { HttpApiBuilder } from "effect/http-api"
import * as Schedule from "effect/Schedule"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"

import { dieOnMarkdown } from "../http/dieOnMarkdown"
import { toWebHeaders } from "../http/toWebHeaders"
import { contentBundle } from "./contentBundle"
import { createTicket } from "./createTicket"
import { TicketEvents } from "./TicketEvents"

const encodeChanges = Schema.encodeSync(
  Schema.fromJsonString(Schema.Array(ProjectChange))
)

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
      .handle("content", ({ payload }) => contentBundle(payload))
      .handleRaw("events", () =>
        Effect.gen(function* () {
          const { projectId, orgSlug, slug } = yield* ProjectScope
          const user = yield* CurrentUser
          const request = yield* HttpServerRequest.HttpServerRequest
          const auth = yield* BetterAuth.BetterAuth
          const session = auth.getSession(toWebHeaders(request.headers), {
            revalidate: true
          })
          const opened = yield* session.pipe(Effect.orDie)
          if (opened?.user.id !== user.id) return yield* new Unauthorized()
          const expiresAt = opened.session.expiresAt.getTime()
          const sessionValid = Effect.gen(function* () {
            const current = yield* session
            const now = yield* Clock.currentTimeMillis
            return (
              current?.session.id === opened.session.id &&
              current.user.id === user.id &&
              now < Math.min(expiresAt, current.session.expiresAt.getTime())
            )
          }).pipe(Effect.orElseSucceed(() => false))
          const access = yield* Access.Access
          const readable = access.project(orgSlug, slug).pipe(
            Effect.map(
              (scope) =>
                scope.projectId === projectId &&
                scope.permissions.can({ ticket: ["read"] })
            ),
            Effect.provideService(CurrentUser, user),
            Effect.catchTag("NotFound", () => Effect.succeed(false))
          )
          const events = yield* TicketEvents
          const remaining = expiresAt - (yield* Clock.currentTimeMillis)
          if (remaining <= 0) return yield* new Unauthorized()
          const changes = yield* events.subscribe(projectId, user.id).pipe(
            Effect.timeoutOrElse({
              duration: remaining,
              orElse: () => Effect.fail(new Unauthorized())
            })
          )
          if (changes === null) return HttpServerResponse.empty({ status: 429 })
          const heartbeat = Stream.fromEffectSchedule(
            Effect.succeed(null),
            Schedule.spaced("25 seconds")
          ).pipe(Stream.drop(1))
          const send = (batch: ReadonlyArray<ProjectChange> | null) =>
            Effect.gen(function* () {
              if (!(yield* sessionValid)) return ""
              if (batch === null) return "data: []\n\n"
              if (!(yield* readable)) return ""
              return `data: ${encodeChanges(batch)}\n\n`
            })
          return HttpServerResponse.stream(
            Stream.concat(
              Stream.succeed("retry: 1000\n\n"),
              changes.pipe(
                Stream.merge(heartbeat, { haltStrategy: "left" }),
                Stream.mapEffect(send),
                Stream.takeWhile((event) => event !== "")
              )
            ).pipe(
              Stream.interruptWhen(
                Effect.flatMap(Clock.currentTimeMillis, (now) =>
                  Effect.sleep(Math.max(0, expiresAt - now))
                )
              ),
              Stream.encodeText
            ),
            {
              contentType: "text/event-stream",
              headers: {
                "cache-control": "private, no-store, no-transform",
                "x-accel-buffering": "no"
              }
            }
          )
        })
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
      .handle("quickCreate", ({ payload }) =>
        Effect.flatMap(TicketCommands.TicketCommands, (commands) =>
          commands.quickCreate(payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("create", ({ payload }) =>
        createTicket(payload).pipe(dieOnMarkdown)
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
      .handle("sequence", ({ params, query }) =>
        Effect.flatMap(TicketQueries.TicketQueries, (queries) =>
          queries.sequence(params.id, query.from)
        ).pipe(dieOnMarkdown)
      )
      .handle("update", ({ params, payload, query }) =>
        Effect.flatMap(TicketCommands.TicketCommands, (commands) =>
          commands.update(params.id, payload, query.sort)
        ).pipe(dieOnMarkdown, Effect.catchTag("TicketChanged", Effect.die))
      )
      .handle("bulkUpdate", ({ payload }) =>
        Effect.flatMap(TicketCommands.TicketCommands, (commands) =>
          commands.bulkUpdate(payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("bulkArchive", ({ payload }) =>
        Effect.flatMap(TicketCommands.TicketCommands, (commands) =>
          commands.bulkArchive(payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("bulkDelete", ({ payload }) =>
        Effect.flatMap(TicketCommands.TicketCommands, (commands) =>
          commands.bulkDelete(payload)
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
        ).pipe(dieOnMarkdown)
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
