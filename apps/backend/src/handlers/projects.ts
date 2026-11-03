// Thin handlers for the `projects` HttpApi group. All logic in Projects.
//
// Every method that touches markdown collapses `MarkdownError` into a defect
// (HTTP 500). It represents corruption (decode failure, fs blip), not a
// routine outcome the wire needs to model.

import * as GitHubIntegrations from "@pp/integration-github/GitHubIntegrations"
import * as Attachments from "@pp/server-core/attachments/Attachments"
import * as ProjectGithub from "@pp/server-core/projects/ProjectGithub"
import * as ProjectMembers from "@pp/server-core/projects/ProjectMembers"
import * as Projects from "@pp/server-core/projects/Projects"
import * as TicketGit from "@pp/server-core/tickets/TicketGit"
import { AppApi, ProjectScope } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpApiBuilder } from "effect/http-api"

import { dieOnMarkdown } from "./lib"

export const ProjectsHandlerLive = HttpApiBuilder.group(
  AppApi,
  "projects",
  (handlers) =>
    handlers
      .handle("list", () =>
        Effect.flatMap(Projects.Projects, (projects) => projects.list()).pipe(
          dieOnMarkdown
        )
      )
      .handle("create", ({ payload }) =>
        Effect.flatMap(Projects.Projects, (projects) =>
          projects.create(payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("get", () =>
        Effect.flatMap(Projects.Projects, (projects) => projects.get()).pipe(
          dieOnMarkdown
        )
      )
      .handle("update", ({ payload }) =>
        Effect.flatMap(Projects.Projects, (projects) =>
          projects.update(payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("updateSetup", ({ payload }) =>
        Effect.flatMap(Projects.Projects, (projects) =>
          projects.updateSetup(payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("delete", () =>
        Effect.gen(function* () {
          const { orgSlug, slug } = yield* ProjectScope
          const projects = yield* Projects.Projects
          const attachments = yield* Attachments.Attachments
          yield* attachments.orphanProject(orgSlug, slug, projects.remove())
        }).pipe(dieOnMarkdown)
      )
      .handle("githubIntegration", () =>
        Effect.flatMap(GitHubIntegrations.GitHubIntegrations, (integrations) =>
          integrations.getStatus()
        )
      )
      .handle("startGithubInstall", ({ payload }) =>
        Effect.flatMap(GitHubIntegrations.GitHubIntegrations, (integrations) =>
          integrations.startInstall(payload.returnProjectSlug)
        )
      )
      .handle("githubInstallationChoices", ({ query }) =>
        Effect.flatMap(GitHubIntegrations.GitHubIntegrations, (integrations) =>
          integrations.installationChoices(query.state)
        )
      )
      .handle("chooseGithubInstallation", ({ payload }) =>
        Effect.flatMap(GitHubIntegrations.GitHubIntegrations, (integrations) =>
          integrations.chooseInstallation(payload.state, payload.installationId)
        )
      )
      .handle("listGithubInstallationRepos", ({ query }) =>
        Effect.flatMap(GitHubIntegrations.GitHubIntegrations, (integrations) =>
          integrations.listRepos(query.q, query.page ?? 1)
        )
      )
      .handle("listGithubRepos", ({ query }) =>
        Effect.flatMap(ProjectGithub.ProjectGithub, (github) =>
          github.repos(query.q, query.page ?? 1)
        ).pipe(dieOnMarkdown)
      )
      .handle("addMember", ({ payload }) =>
        Effect.flatMap(ProjectMembers.ProjectMembers, (members) =>
          members.addMember(payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("updateMember", ({ params, payload }) =>
        Effect.flatMap(ProjectMembers.ProjectMembers, (members) =>
          members.updateMember(params.userId, payload.role)
        ).pipe(dieOnMarkdown)
      )
      .handle("removeMember", ({ params }) =>
        Effect.flatMap(ProjectMembers.ProjectMembers, (members) =>
          members.removeMember(params.userId)
        ).pipe(dieOnMarkdown)
      )
      .handle("leave", () =>
        Effect.flatMap(ProjectMembers.ProjectMembers, (members) =>
          members.leave()
        )
      )
      .handle("cancelPendingMember", ({ params }) =>
        Effect.flatMap(ProjectMembers.ProjectMembers, (members) =>
          members.cancelPendingMember(params.invitationId)
        ).pipe(dieOnMarkdown)
      )
      .handle("connectGithub", ({ payload }) =>
        Effect.flatMap(ProjectGithub.ProjectGithub, (github) =>
          github.connect(payload)
        ).pipe(dieOnMarkdown)
      )
      .handle("disconnectGithub", () =>
        Effect.flatMap(ProjectGithub.ProjectGithub, (github) =>
          github.disconnect()
        ).pipe(dieOnMarkdown)
      )
      .handle("gitStates", () =>
        Effect.flatMap(TicketGit.TicketGit, (git) => git.listGitStates()).pipe(
          dieOnMarkdown
        )
      )
      .handle("listBranches", ({ query }) =>
        Effect.flatMap(ProjectGithub.ProjectGithub, (github) =>
          github.branches(query.q, query.first ?? 30, query.after)
        ).pipe(dieOnMarkdown)
      )
)
