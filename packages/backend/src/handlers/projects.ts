// Thin handlers for the `projects` HttpApi group. All logic in Projects.
//
// Every method that touches markdown collapses `MarkdownError` into a defect
// (HTTP 500). It represents corruption (decode failure, fs blip), not a
// routine outcome the wire needs to model. Routine errors — `NotFound`,
// `Forbidden` — stay in the typed error channel.

import { HttpApiBuilder } from "@effect/platform"
import { AppApi, CurrentUser } from "@projectproject/shared"
import { Effect } from "effect"
import { TRANSITIONAL_ORG_SLUG as org } from "../lib/transitionalOrg"
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
          return yield* projects.list(org, user.id)
        })
      )
      .handle("create", ({ payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const projects = yield* Projects
          return yield* projects.create(org, user.id, payload)
        }).pipe(Effect.catchTag("NotFound", (cause) => Effect.die(cause)))
      )
      .handle("get", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const projects = yield* Projects
          return yield* projects.get(org, user.id, path.slug)
        }).pipe(Effect.catchTag("MarkdownError", (cause) => Effect.die(cause)))
      )
      .handle("update", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const projects = yield* Projects
          return yield* projects.update(org, user.id, path.slug, payload)
        }).pipe(Effect.catchTag("MarkdownError", (cause) => Effect.die(cause)))
      )
      .handle("delete", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const projects = yield* Projects
          yield* projects.remove(org, user.id, path.slug)
        }).pipe(Effect.catchTag("MarkdownError", (cause) => Effect.die(cause)))
      )
      .handle("addMember", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const projects = yield* Projects
          return yield* projects.addMember(org, user.id, path.slug, payload)
        }).pipe(Effect.catchTag("MarkdownError", (cause) => Effect.die(cause)))
      )
      .handle("updateMember", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const projects = yield* Projects
          return yield* projects.updateMember(
            org,
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
          return yield* projects.removeMember(
            org,
            user.id,
            path.slug,
            path.userId
          )
        }).pipe(Effect.catchTag("MarkdownError", (cause) => Effect.die(cause)))
      )
      .handle("connectGithub", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const projects = yield* Projects
          return yield* projects.connectGithub(
            org,
            user.id,
            path.slug,
            payload
          )
        }).pipe(Effect.catchTag("MarkdownError", (cause) => Effect.die(cause)))
      )
      .handle("disconnectGithub", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const projects = yield* Projects
          return yield* projects.disconnectGithub(org, user.id, path.slug)
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
      .handle("gitStates", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const tickets = yield* Tickets
          return yield* tickets.listGitStates(org, user.id, path.slug)
        }).pipe(Effect.catchTag("MarkdownError", (cause) => Effect.die(cause)))
      )
      .handle("listBranches", ({ path, urlParams }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const projects = yield* Projects
          const github = yield* GitHub
          const project = yield* projects
            .get(org, user.id, path.slug)
            .pipe(Effect.catchTag("MarkdownError", (e) => Effect.die(e)))
          if (!project.github) {
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
