// Thin handlers for the `projects` HttpApi group. All logic in Projects.
//
// Every method that touches markdown collapses `MarkdownError` into a defect
// (HTTP 500). It represents corruption (decode failure, fs blip), not a
// routine outcome the wire needs to model. Routine errors — `NotFound`,
// `Forbidden` — stay in the typed error channel.

import { HttpApiBuilder } from "@effect/platform"
import { AppApi, CurrentUser } from "@projectproject/shared"
import { Effect } from "effect"
import { GitHub } from "../services/GitHub"
import { Projects } from "../services/Projects"
import { Tickets } from "../services/Tickets"

export const ProjectsHandlerLive = HttpApiBuilder.group(
  AppApi,
  "projects",
  (handlers) =>
    handlers
      .handle("list", () =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const projects = yield* Projects
          return yield* projects.list(user.id)
        })
      )
      .handle("create", ({ payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const projects = yield* Projects
          return yield* projects.create(user.id, payload)
        })
      )
      .handle("get", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const projects = yield* Projects
          return yield* projects.get(user.id, path.slug)
        }).pipe(Effect.catchTag("MarkdownError", (cause) => Effect.die(cause)))
      )
      .handle("update", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const projects = yield* Projects
          return yield* projects.update(user.id, path.slug, payload)
        }).pipe(Effect.catchTag("MarkdownError", (cause) => Effect.die(cause)))
      )
      .handle("delete", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const projects = yield* Projects
          yield* projects.remove(user.id, path.slug)
        }).pipe(Effect.catchTag("MarkdownError", (cause) => Effect.die(cause)))
      )
      .handle("addMember", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const projects = yield* Projects
          return yield* projects.addMember(user.id, path.slug, payload)
        }).pipe(Effect.catchTag("MarkdownError", (cause) => Effect.die(cause)))
      )
      .handle("updateMember", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const projects = yield* Projects
          return yield* projects.updateMember(
            user.id,
            path.slug,
            path.userId,
            payload.role
          )
        }).pipe(Effect.catchTag("MarkdownError", (cause) => Effect.die(cause)))
      )
      .handle("removeMember", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const projects = yield* Projects
          return yield* projects.removeMember(user.id, path.slug, path.userId)
        }).pipe(Effect.catchTag("MarkdownError", (cause) => Effect.die(cause)))
      )
      .handle("connectGithub", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const projects = yield* Projects
          return yield* projects.connectGithub(user.id, path.slug, payload)
        }).pipe(Effect.catchTag("MarkdownError", (cause) => Effect.die(cause)))
      )
      .handle("disconnectGithub", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const projects = yield* Projects
          return yield* projects.disconnectGithub(user.id, path.slug)
        }).pipe(Effect.catchTag("MarkdownError", (cause) => Effect.die(cause)))
      )
      .handle("listRepos", ({ urlParams }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const github = yield* GitHub
          return yield* github.listUserRepos(
            user.id,
            urlParams.q,
            urlParams.page ?? 1
          )
        })
      )
      // gitStates lives on the Tickets service because the auto-status
      // transition writes ticket markdown. The handler is in this group
      // because the URL is project-scoped.
      .handle("gitStates", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const tickets = yield* Tickets
          return yield* tickets.listGitStates(user.id, path.slug)
        }).pipe(Effect.catchTag("MarkdownError", (cause) => Effect.die(cause)))
      )
      .handle("listBranches", ({ path, urlParams }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const projects = yield* Projects
          const github = yield* GitHub
          const project = yield* projects
            .get(user.id, path.slug)
            .pipe(Effect.catchTag("MarkdownError", (e) => Effect.die(e)))
          if (!project.github) {
            // No connected repo → empty result (avoids inventing a Conflict
            // here; the UI shouldn't be able to open this form anyway).
            return { items: [], hasMore: false }
          }
          return yield* github.listBranches(
            project.github.repoOwner,
            project.github.repoName,
            urlParams.q,
            urlParams.first ?? 30,
            user.id
          )
        })
      )
)
