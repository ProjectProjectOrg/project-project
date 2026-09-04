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
import * as Effect from "effect/Effect"
import { Attachments } from "../Services/Attachments"
import { CurrentOrg } from "../Services/CurrentOrg"
import { GitHub } from "../Services/GitHub"
import { GitHubIntegrations } from "../Services/GitHubIntegrations"
import { EverhourIntegrations } from "../Services/EverhourIntegrations"
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
          const result = yield* projects.update(
            org.orgSlug,
            user.id,
            path.slug,
            payload
          )
          if (payload.name !== undefined) {
            const everhour = yield* EverhourIntegrations
            yield* everhour.bestEffortProjectSync(
              org.orgSlug,
              user.id,
              path.slug
            )
          }
          return result
        }).pipe(Effect.catchTag("MarkdownError", (cause) => Effect.die(cause)))
      )
      .handle("updateSetup", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const projects = yield* Projects
          return yield* projects.updateSetup(
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
          const attachments = yield* Attachments
          yield* projects.remove(org.orgSlug, user.id, path.slug)
          yield* attachments.orphanProject(org.orgSlug, path.slug)
        }).pipe(Effect.catchTag("MarkdownError", (cause) => Effect.die(cause)))
      )
      .handle("githubIntegration", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          yield* currentOrg.resolve(path.orgSlug, user.id)
          const integrations = yield* GitHubIntegrations
          return yield* integrations.getStatus(path.orgSlug, user.id)
        })
      )
      .handle("startGithubInstall", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          yield* currentOrg.resolve(path.orgSlug, user.id)
          const integrations = yield* GitHubIntegrations
          return yield* integrations.startInstall(
            path.orgSlug,
            user.id,
            payload.returnProjectSlug
          )
        })
      )
      .handle("listGithubInstallationRepos", ({ path, urlParams }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          yield* currentOrg.resolve(path.orgSlug, user.id)
          const integrations = yield* GitHubIntegrations
          return yield* integrations.listRepos(
            path.orgSlug,
            user.id,
            urlParams.q,
            urlParams.page ?? 1
          )
        })
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
      .handle("transferOwnership", ({ path, payload }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const projects = yield* Projects
          return yield* projects.transferOwnership(
            org.orgSlug,
            user.id,
            path.slug,
            payload.userId
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
        }).pipe(
          Effect.catchTag("MarkdownError", (cause) => Effect.die(cause)),
          Effect.catchTag("MalformedTicketDocument", (cause) =>
            Effect.die(cause)
          )
        )
      )
      .handle("cancelPendingMember", ({ path }) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const currentOrg = yield* CurrentOrg
          const org = yield* currentOrg.resolve(path.orgSlug, user.id)
          const projects = yield* Projects
          return yield* projects.cancelPendingMember(
            org.orgSlug,
            user.id,
            path.slug,
            path.invitationId
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
          const projectGithub = yield* projects.getGithubIntegration(
            org.orgSlug,
            user.id,
            path.slug
          )
          if (!projectGithub) {
            return { items: [], hasMore: false }
          }
          return yield* github.listInstallationBranches(
            projectGithub.installationId,
            projectGithub.repoOwner,
            projectGithub.repoName,
            urlParams.q,
            urlParams.first ?? 30
          )
        })
      )
)
