// Thin handlers for the `projects` HttpApi group. All logic in Projects.
//
// Every method that touches markdown collapses `MarkdownError` into a defect
// (HTTP 500). It represents corruption (decode failure, fs blip), not a
// routine outcome the wire needs to model.

import { Attachments } from "@pp/server-core/attachments/Attachments"
import { GitHubIntegrations } from "@pp/server-core/github/GitHubIntegrations"
import { Projects } from "@pp/server-core/projects/Projects"
import { Tickets } from "@pp/server-core/tickets/Tickets"
import { AppApi, ProjectScope } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import { dieOnMarkdown, thenSyncEverhour } from "./lib"

export const ProjectsHandlerLive = HttpApiBuilder.group(
  AppApi,
  "projects",
  (handlers) =>
    handlers
      .handle("list", () =>
        Effect.flatMap(Projects, (projects) => projects.list()).pipe(
          dieOnMarkdown
        )
      )
      .handle("create", ({ payload }) =>
        Effect.flatMap(Projects, (projects) => projects.create(payload)).pipe(
          dieOnMarkdown
        )
      )
      .handle("get", () =>
        Effect.flatMap(Projects, (projects) => projects.get()).pipe(
          dieOnMarkdown
        )
      )
      .handle("update", ({ payload }) =>
        Effect.flatMap(Projects, (projects) => projects.update(payload)).pipe(
          (updated) =>
            payload.name === undefined ? updated : thenSyncEverhour(updated),
          dieOnMarkdown
        )
      )
      .handle("updateSetup", ({ payload }) =>
        Effect.flatMap(Projects, (projects) =>
          projects.updateSetup(payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("delete", () =>
        Effect.gen(function* () {
          const { orgSlug, slug } = yield* ProjectScope
          const projects = yield* Projects
          const attachments = yield* Attachments
          yield* attachments.orphanProject(orgSlug, slug, projects.remove())
        }).pipe(dieOnMarkdown)
      )
      .handle("githubIntegration", () =>
        Effect.flatMap(GitHubIntegrations, (integrations) =>
          integrations.getStatus()
        )
      )
      .handle("startGithubInstall", ({ payload }) =>
        Effect.flatMap(GitHubIntegrations, (integrations) =>
          integrations.startInstall(payload.returnProjectSlug)
        )
      )
      .handle("listGithubInstallationRepos", ({ query }) =>
        Effect.flatMap(GitHubIntegrations, (integrations) =>
          integrations.listRepos(query.q, query.page ?? 1)
        )
      )
      .handle("listGithubRepos", ({ query }) =>
        Effect.flatMap(Projects, (projects) =>
          projects.githubRepos(query.q, query.page ?? 1)
        ).pipe(dieOnMarkdown)
      )
      .handle("addMember", ({ payload }) =>
        Effect.flatMap(Projects, (projects) =>
          projects.addMember(payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("updateMember", ({ params, payload }) =>
        Effect.flatMap(Projects, (projects) =>
          projects.updateMember(params.userId, payload.role)
        ).pipe(dieOnMarkdown)
      )
      .handle("removeMember", ({ params }) =>
        Effect.flatMap(Projects, (projects) =>
          projects.removeMember(params.userId)
        ).pipe(dieOnMarkdown)
      )
      .handle("cancelPendingMember", ({ params }) =>
        Effect.flatMap(Projects, (projects) =>
          projects.cancelPendingMember(params.invitationId)
        ).pipe(dieOnMarkdown)
      )
      .handle("connectGithub", ({ payload }) =>
        Effect.flatMap(Projects, (projects) =>
          projects.connectGithub(payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("disconnectGithub", () =>
        Effect.flatMap(Projects, (projects) =>
          projects.disconnectGithub()
        ).pipe(dieOnMarkdown)
      )
      .handle("gitStates", () =>
        Effect.flatMap(Tickets, (tickets) => tickets.listGitStates()).pipe(
          dieOnMarkdown
        )
      )
      .handle("listBranches", ({ query }) =>
        Effect.flatMap(Projects, (projects) =>
          projects.githubBranches(query.q, query.first ?? 30)
        ).pipe(dieOnMarkdown)
      )
)
