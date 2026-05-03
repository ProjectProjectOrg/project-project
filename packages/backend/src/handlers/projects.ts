// Thin handlers for the `projects` HttpApi group. All logic in Projects.

import { HttpApiBuilder } from "@effect/platform"
import { AppApi, CurrentUser } from "@projectproject/shared"
import { Effect } from "effect"
import { Projects } from "../services/Projects"

export const ProjectsHandlerLive = HttpApiBuilder.group(
  AppApi,
  "projects",
  (handlers) =>
    handlers
      .handle("list", () =>
        Effect.gen(function*() {
          const user = yield* CurrentUser
          const projects = yield* Projects
          return yield* projects.list(user.id)
        }))
      .handle("create", ({ payload }) =>
        Effect.gen(function*() {
          const user = yield* CurrentUser
          const projects = yield* Projects
          return yield* projects.create(user.id, payload)
        }))
      .handle("get", ({ path }) =>
        Effect.gen(function*() {
          const user = yield* CurrentUser
          const projects = yield* Projects
          return yield* projects.get(user.id, path.slug)
        }).pipe(
          // MarkdownError = corruption (decode failure, fs blip). Surface it as
          // a 500 instead of muddying the wire with an internal error type.
          // NotFound is a routine outcome and stays in the typed error channel.
          Effect.catchTag("MarkdownError", (cause) => Effect.die(cause))
        ))
      .handle("update", ({ path, payload }) =>
        Effect.gen(function*() {
          const user = yield* CurrentUser
          const projects = yield* Projects
          return yield* projects.update(user.id, path.slug, payload)
        }).pipe(Effect.catchTag("MarkdownError", (cause) => Effect.die(cause))))
      .handle("delete", ({ path }) =>
        Effect.gen(function*() {
          const user = yield* CurrentUser
          const projects = yield* Projects
          yield* projects.remove(user.id, path.slug)
        }).pipe(Effect.catchTag("MarkdownError", (cause) => Effect.die(cause))))
)
