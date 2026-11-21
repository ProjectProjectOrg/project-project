import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import * as Schema from "effect/Schema"

import { OrgAccess, RequiresOrg } from "../access/OrgAccess"
import { ProjectAccess, RequiresProject } from "../access/ProjectAccess"
import { Authentication } from "../auth/Authentication"
import {
  GitHubError,
  GitHubScopeInsufficient,
  GitHubTokenExpired,
  LastProjectPmBlocked,
  RateLimited,
  RepoGone,
  StorageError,
  GitHubConnectionConflict,
  ProjectIdentifierTaken,
  Validation
} from "../errors"
import { BranchListResponse, GitStatesResponse } from "../github/GitState"
import { OrgPath, ProjectPath } from "../http/paths"
import {
  AddMemberInput,
  ChooseGithubInstallationInput,
  ChooseGithubInstallationResponse,
  ConnectGithubInput,
  CreateProjectInput,
  GithubInstallationChoices,
  GithubOrgIntegrationStatus,
  GithubRepoPage,
  Project,
  ProjectDetail,
  ProjectGithubInstallation,
  Slug,
  StartGithubAppManifestInput,
  StartGithubAppManifestResponse,
  StartGithubInstallInput,
  StartGithubInstallResponse,
  UpdateGithubInstallationInput,
  UpdateMemberInput,
  UpdateProjectInput,
  UpdateProjectSetupInput
} from "./Project"

const ProjectMemberPath = Schema.Struct({
  orgSlug: Slug,
  slug: Slug,
  userId: Schema.String
})

const PendingProjectMemberPath = Schema.Struct({
  orgSlug: Slug,
  slug: Slug,
  invitationId: Schema.String
})

export const ProjectsGroup = HttpApiGroup.make("projects")
  .add(
    HttpApiEndpoint.get("list", "/orgs/:orgSlug/projects", {
      params: OrgPath,
      success: Schema.Array(Project)
    })
      .annotate(RequiresOrg, "membership")
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.post("create", "/orgs/:orgSlug/projects", {
      params: OrgPath,
      payload: CreateProjectInput,
      success: Project,
      error: [ProjectIdentifierTaken]
    })
      .annotate(RequiresOrg, { project: ["create"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.get("get", "/orgs/:orgSlug/projects/:slug", {
      params: ProjectPath,
      success: ProjectDetail
    })
      .annotate(RequiresProject, { docs: ["read"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.patch("update", "/orgs/:orgSlug/projects/:slug", {
      params: ProjectPath,
      payload: UpdateProjectInput,
      success: ProjectDetail
    })
      .annotate(RequiresProject, { docs: ["write"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.patch(
      "updateSetup",
      "/orgs/:orgSlug/projects/:slug/setup",
      {
        params: ProjectPath,
        payload: UpdateProjectSetupInput,
        success: ProjectDetail
      }
    )
      .annotate(RequiresProject, { settings: ["manage"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.delete("delete", "/orgs/:orgSlug/projects/:slug", {
      params: ProjectPath
    })
      .annotate(RequiresProject, { project: ["delete"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.get("export", "/orgs/:orgSlug/projects/:slug/export", {
      params: ProjectPath,
      success: HttpApiSchema.StreamUint8Array({
        contentType: "application/gzip"
      }),
      error: StorageError
    })
      .annotate(RequiresProject, { project: ["export"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.get(
      "githubIntegration",
      "/orgs/:orgSlug/integrations/github",
      {
        params: OrgPath,
        success: GithubOrgIntegrationStatus
      }
    )
      .annotate(RequiresOrg, "membership")
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "startGithubAppManifest",
      "/orgs/:orgSlug/integrations/github/apps/manifest",
      {
        params: OrgPath,
        payload: StartGithubAppManifestInput,
        success: StartGithubAppManifestResponse,
        error: GitHubError
      }
    )
      .annotate(RequiresOrg, { integration: ["manage"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.delete(
      "deleteGithubApp",
      "/orgs/:orgSlug/integrations/github/apps/:appId",
      {
        params: Schema.Struct({ ...OrgPath.fields, appId: Schema.String }),
        success: GithubOrgIntegrationStatus
      }
    )
      .annotate(RequiresOrg, { integration: ["manage"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.patch(
      "updateGithubInstallation",
      "/orgs/:orgSlug/integrations/github/installations/:installationId",
      {
        params: Schema.Struct({
          ...OrgPath.fields,
          installationId: Schema.String
        }),
        payload: UpdateGithubInstallationInput,
        success: GithubOrgIntegrationStatus
      }
    )
      .annotate(RequiresOrg, { integration: ["manage"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.delete(
      "deleteGithubInstallation",
      "/orgs/:orgSlug/integrations/github/installations/:installationId",
      {
        params: Schema.Struct({
          ...OrgPath.fields,
          installationId: Schema.String
        }),
        success: GithubOrgIntegrationStatus
      }
    )
      .annotate(RequiresOrg, { integration: ["manage"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "startGithubInstall",
      "/orgs/:orgSlug/integrations/github/install/start",
      {
        params: OrgPath,
        payload: StartGithubInstallInput,
        success: StartGithubInstallResponse,
        error: GitHubError
      }
    )
      .annotate(RequiresOrg, { integration: ["manage"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.get(
      "githubInstallationChoices",
      "/orgs/:orgSlug/integrations/github/install/choices",
      {
        params: OrgPath,
        query: Schema.Struct({ state: Schema.NonEmptyString }),
        success: GithubInstallationChoices
      }
    )
      .annotate(RequiresOrg, { integration: ["manage"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "chooseGithubInstallation",
      "/orgs/:orgSlug/integrations/github/install/choose",
      {
        params: OrgPath,
        payload: ChooseGithubInstallationInput,
        success: ChooseGithubInstallationResponse,
        error: [GitHubError, GitHubConnectionConflict]
      }
    )
      .annotate(RequiresOrg, { integration: ["manage"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.get(
      "listGithubInstallationRepos",
      "/orgs/:orgSlug/integrations/github/repos",
      {
        params: OrgPath,
        query: Schema.Struct({
          q: Schema.optional(Schema.String),
          page: Schema.optional(
            Schema.FiniteFromString.pipe(
              Schema.check(Schema.isInt()),
              Schema.check(Schema.isGreaterThan(0))
            )
          ),
          installationId: Schema.optional(Schema.String)
        }),
        success: GithubRepoPage,
        error: [RepoGone, RateLimited, GitHubError]
      }
    )
      .annotate(RequiresOrg, { integration: ["manage"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.post("addMember", "/orgs/:orgSlug/projects/:slug/members", {
      params: ProjectPath,
      payload: AddMemberInput,
      success: ProjectDetail,
      error: LastProjectPmBlocked
    })
      .annotate(RequiresProject, { members: ["manage"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.patch(
      "updateMember",
      "/orgs/:orgSlug/projects/:slug/members/:userId",
      {
        params: ProjectMemberPath,
        payload: UpdateMemberInput,
        success: ProjectDetail,
        error: LastProjectPmBlocked
      }
    )
      .annotate(RequiresProject, { members: ["manage"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.delete(
      "removeMember",
      "/orgs/:orgSlug/projects/:slug/members/:userId",
      {
        params: ProjectMemberPath,
        success: ProjectDetail,
        error: [LastProjectPmBlocked, Validation]
      }
    )
      .annotate(RequiresProject, { members: ["manage"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.post("leave", "/orgs/:orgSlug/projects/:slug/leave", {
      params: ProjectPath,
      success: HttpApiSchema.NoContent,
      error: LastProjectPmBlocked
    })
      .annotate(RequiresProject, "membership")
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.delete(
      "cancelPendingMember",
      "/orgs/:orgSlug/projects/:slug/pending-members/:invitationId",
      {
        params: PendingProjectMemberPath,
        success: ProjectDetail
      }
    )
      .annotate(RequiresProject, { members: ["manage"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "connectGithub",
      "/orgs/:orgSlug/projects/:slug/github",
      {
        params: ProjectPath,
        payload: ConnectGithubInput,
        success: ProjectDetail,
        error: [
          GitHubTokenExpired,
          GitHubScopeInsufficient,
          RepoGone,
          RateLimited,
          GitHubError,
          GitHubConnectionConflict
        ]
      }
    )
      .annotate(RequiresProject, { github: ["write"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.delete(
      "disconnectGithub",
      "/orgs/:orgSlug/projects/:slug/github/:repoId",
      {
        params: Schema.Struct({
          ...ProjectPath.fields,
          repoId: Schema.String
        }),
        success: ProjectDetail
      }
    )
      .annotate(RequiresProject, { github: ["write"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.get(
      "gitStates",
      "/orgs/:orgSlug/projects/:slug/git-states",
      {
        params: ProjectPath,
        success: GitStatesResponse
      }
    )
      .annotate(RequiresProject, { github: ["read"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.get(
      "listBranches",
      "/orgs/:orgSlug/projects/:slug/github/branches",
      {
        params: ProjectPath,
        query: Schema.Struct({
          q: Schema.optional(Schema.String),
          first: Schema.optional(Schema.FiniteFromString),
          after: Schema.optional(Schema.String),
          repoId: Schema.optional(Schema.String)
        }),
        success: BranchListResponse,
        error: [
          GitHubTokenExpired,
          GitHubScopeInsufficient,
          RepoGone,
          RateLimited,
          GitHubError
        ]
      }
    )
      .annotate(RequiresProject, { github: ["read"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.get(
      "listGithubInstallations",
      "/orgs/:orgSlug/projects/:slug/github/installations",
      {
        params: ProjectPath,
        success: Schema.Array(ProjectGithubInstallation)
      }
    )
      .annotate(RequiresProject, { github: ["write"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.get(
      "listGithubRepos",
      "/orgs/:orgSlug/projects/:slug/github/repos",
      {
        params: ProjectPath,
        query: Schema.Struct({
          q: Schema.optional(Schema.String),
          page: Schema.optional(
            Schema.FiniteFromString.pipe(
              Schema.check(Schema.isInt()),
              Schema.check(Schema.isGreaterThan(0))
            )
          ),
          installationId: Schema.optional(Schema.String)
        }),
        success: GithubRepoPage,
        error: [RepoGone, RateLimited, GitHubError]
      }
    )
      .annotate(RequiresProject, { github: ["write"] })
      .middleware(ProjectAccess)
  )
  .middleware(Authentication)
