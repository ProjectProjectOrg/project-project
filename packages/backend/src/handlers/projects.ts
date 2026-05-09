// Thin handlers for the `projects` HttpApi group. All logic in Projects.
//
// Every method that touches markdown collapses `MarkdownError` into a defect
// (HTTP 500). It represents corruption (decode failure, fs blip), not a
// routine outcome the wire needs to model.
//
// Org gate: each handler resolves `(orgSlug, user.id)` via CurrentOrg before
// hitting any project-level logic. A miss collapses to NotFound — same wire
// response as "no such project", so we never leak which orgs exist.

import { HttpApiBuilder } from "@effect/platform"
import { AppApi, CurrentUser } from "@projectproject/shared"
import { Effect } from "effect"
import { CurrentOrg } from "../Services/CurrentOrg"
import { GitHub } from "../Services/GitHub"
import { Projects } from "../Services/Projects"
import { Tickets } from "../Services/Tickets"

export const ProjectsHandlerLive = HttpApiBuilder.group(
  AppApi,
  "projects",
  (handlers) =>
    handlers
      .handle("list", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const projects = yield* Projects
          return yield* projects.list(org.orgSlug, user.id)
        })
      )
      .handle("create", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const projects = yield* Projects
          return yield* projects.create(org.orgSlug, user.id, payload)
        }).pipe(Effect.catchTag("NotFound", (cause) => Effect.die(cause)))
      )
      .handle("get", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const projects = yield* Projects
          return yield* projects.get(org.orgSlug, user.id, path.slug)
        }).pipe(Effect.catchTag("MarkdownError", (cause) => Effect.die(cause)))
      )
      .handle("update", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const projects = yield* Projects
          return yield* projects.update(
            org.orgSlug,
            user.id,
            path.slug,
            payload
          )
        }).pipe(Effect.catchTag("MarkdownError", (cause) => Effect.die(cause)))
      )
      .handle("delete", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const projects = yield* Projects
          yield* projects.remove(org.orgSlug, user.id, path.slug)
        }).pipe(Effect.catchTag("MarkdownError", (cause) => Effect.die(cause)))
      )
      .handle("addMember", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const projects = yield* Projects
          return yield* projects.addMember(
            org.orgSlug,
            user.id,
            path.slug,
            payload
          )
        }).pipe(Effect.catchTag("MarkdownError", (cause) => Effect.die(cause)))
      )
      .handle("updateMember", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const projects = yield* Projects
          return yield* projects.updateMember(
            org.orgSlug,
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
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const projects = yield* Projects
          return yield* projects.removeMember(
            org.orgSlug,
            user.id,
            path.slug,
            path.userId
          )
        }).pipe(Effect.catchTag("MarkdownError", (cause) => Effect.die(cause)))
      )
      .handle("connectGithub", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const projects = yield* Projects
          return yield* projects.connectGithub(
            org.orgSlug,
            user.id,
            path.slug,
            payload
          )
        }).pipe(Effect.catchTag("MarkdownError", (cause) => Effect.die(cause)))
      )
      .handle("disconnectGithub", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const projects = yield* Projects
          return yield* projects.disconnectGithub(
            org.orgSlug,
            user.id,
            path.slug
          )
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
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const tickets = yield* Tickets
          return yield* tickets.listGitStates(org.orgSlug, user.id, path.slug)
        }).pipe(Effect.catchTag("MarkdownError", (cause) => Effect.die(cause)))
      )
      .handle("listBranches", ({ path, urlParams }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const projects = yield* Projects
          const github = yield* GitHub
          const project = yield* projects
            .get(org.orgSlug, user.id, path.slug)
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
