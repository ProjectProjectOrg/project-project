// packages/shared/src/api.ts
//
// THIS FILE IS THE CONTRACT.
// ----------------------------------------------------------------------------
// ProjectProject's HTTP API is defined here, once. The backend implements it; the
// frontend consumes it via `HttpApiClient.make(AppApi)`; the OpenAPI spec is
// derived from it. There is no code generation step — the *type* of `AppApi`
// is what flows into both ends.
//
// ORG-SCOPED PATHS (T-05)
// ----------------------------------------------------------------------------
// Every project- and ticket-scoped endpoint is nested under
// `/orgs/:orgSlug/...`. Handlers read `path.orgSlug` and use it to scope all
// downstream service calls. The `:orgSlug` is the URL-canonical source of
// "which org am I acting in?" — see `services/CurrentOrg.ts` for the resolver.

import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  OpenApi
} from "@effect/platform"
import { Schema } from "effect"
import { User } from "./schemas/User"
import {
  AddMemberInput,
  ConnectGithubInput,
  CreateProjectInput,
  GithubRepoPage,
  Project,
  ProjectDetail,
  Slug,
  UpdateMemberInput,
  UpdateProjectInput
} from "./schemas/Project"
import {
  CreateTicketInput,
  Ticket,
  TicketDetail,
  TicketId,
  UpdateTicketInput
} from "./schemas/Ticket"
import {
  AttachBranchInput,
  BranchListResponse,
  CreateBranchInput,
  GitStatesResponse,
  OpenPrInput,
  OpenPrResult
} from "./schemas/GitState"
import {
  CreateTagInput,
  Tag,
  TagName,
  UpdateTagInput
} from "./schemas/Tag"
import {
  BranchExists,
  BranchNotFound,
  BranchProtected,
  Conflict,
  Forbidden,
  GitHubError,
  GitHubScopeInsufficient,
  GitHubTokenExpired,
  NotFound,
  RateLimited,
  RepoGone,
  Unauthorized
} from "./errors"
import { Authentication } from "./Authentication"

const HealthResponse = Schema.Struct({
  status: Schema.Literal("ok")
})
export type HealthResponse = typeof HealthResponse.Type

const HealthGroup = HttpApiGroup.make("health").add(
  HttpApiEndpoint.get("get", "/health").addSuccess(HealthResponse)
)

const DbPingResponse = Schema.Struct({
  projectCount: Schema.Number
})
export type DbPingResponse = typeof DbPingResponse.Type

const DbGroup = HttpApiGroup.make("db").add(
  HttpApiEndpoint.get("ping", "/db/ping").addSuccess(DbPingResponse)
)

const AuthGroup = HttpApiGroup.make("auth")
  .add(HttpApiEndpoint.get("me", "/me").addSuccess(User).addError(Unauthorized))
  .middleware(Authentication)

const OrgPath = Schema.Struct({ orgSlug: Slug })
const ProjectPath = Schema.Struct({ orgSlug: Slug, slug: Slug })
const ProjectMemberPath = Schema.Struct({
  orgSlug: Slug,
  slug: Slug,
  userId: Schema.String
})
const TicketPath = Schema.Struct({ orgSlug: Slug, slug: Slug, id: TicketId })
const ProjectTagPath = Schema.Struct({
  orgSlug: Slug,
  slug: Slug,
  name: TagName
})

const ProjectsGroup = HttpApiGroup.make("projects")
  .add(
    HttpApiEndpoint.get("list", "/orgs/:orgSlug/projects")
      .setPath(OrgPath)
      .addSuccess(Schema.Array(Project))
      .addError(Unauthorized)
      .addError(NotFound)
  )
  .add(
    HttpApiEndpoint.post("create", "/orgs/:orgSlug/projects")
      .setPath(OrgPath)
      .setPayload(CreateProjectInput)
      .addSuccess(Project)
      .addError(Unauthorized)
      .addError(NotFound)
  )
  .add(
    HttpApiEndpoint.get("get", "/orgs/:orgSlug/projects/:slug")
      .setPath(ProjectPath)
      .addSuccess(ProjectDetail)
      .addError(Unauthorized)
      .addError(NotFound)
  )
  .add(
    HttpApiEndpoint.patch("update", "/orgs/:orgSlug/projects/:slug")
      .setPath(ProjectPath)
      .setPayload(UpdateProjectInput)
      .addSuccess(ProjectDetail)
      .addError(Unauthorized)
      .addError(NotFound)
      .addError(Forbidden)
  )
  .add(
    HttpApiEndpoint.del("delete", "/orgs/:orgSlug/projects/:slug")
      .setPath(ProjectPath)
      .addError(Unauthorized)
      .addError(NotFound)
      .addError(Forbidden)
  )
  .add(
    HttpApiEndpoint.post("addMember", "/orgs/:orgSlug/projects/:slug/members")
      .setPath(ProjectPath)
      .setPayload(AddMemberInput)
      .addSuccess(ProjectDetail)
      .addError(Unauthorized)
      .addError(NotFound)
      .addError(Forbidden)
  )
  .add(
    HttpApiEndpoint.patch(
      "updateMember",
      "/orgs/:orgSlug/projects/:slug/members/:userId"
    )
      .setPath(ProjectMemberPath)
      .setPayload(UpdateMemberInput)
      .addSuccess(ProjectDetail)
      .addError(Unauthorized)
      .addError(NotFound)
      .addError(Forbidden)
  )
  .add(
    HttpApiEndpoint.del(
      "removeMember",
      "/orgs/:orgSlug/projects/:slug/members/:userId"
    )
      .setPath(ProjectMemberPath)
      .addSuccess(ProjectDetail)
      .addError(Unauthorized)
      .addError(NotFound)
      .addError(Forbidden)
  )
  .add(
    HttpApiEndpoint.post(
      "connectGithub",
      "/orgs/:orgSlug/projects/:slug/github"
    )
      .setPath(ProjectPath)
      .setPayload(ConnectGithubInput)
      .addSuccess(ProjectDetail)
      .addError(Unauthorized)
      .addError(NotFound)
      .addError(Forbidden)
      .addError(Conflict)
      .addError(GitHubTokenExpired)
      .addError(GitHubScopeInsufficient)
      .addError(RepoGone)
      .addError(GitHubError)
  )
  .add(
    HttpApiEndpoint.del(
      "disconnectGithub",
      "/orgs/:orgSlug/projects/:slug/github"
    )
      .setPath(ProjectPath)
      .addSuccess(ProjectDetail)
      .addError(Unauthorized)
      .addError(NotFound)
      .addError(Forbidden)
  )
  // User-scoped: lists the caller's GitHub repos. Not org-scoped — lives
  // outside the `/orgs/:orgSlug` tree on purpose; the picker calls this
  // before a repo is connected to a project so there's no project context.
  .add(
    HttpApiEndpoint.get("listRepos", "/github/repos")
      .setUrlParams(
        Schema.Struct({
          q: Schema.optional(Schema.String),
          page: Schema.optional(Schema.NumberFromString)
        })
      )
      .addSuccess(GithubRepoPage)
      .addError(Unauthorized)
      .addError(GitHubTokenExpired)
      .addError(GitHubScopeInsufficient)
      .addError(GitHubError)
  )
  .add(
    HttpApiEndpoint.get(
      "gitStates",
      "/orgs/:orgSlug/projects/:slug/git-states"
    )
      .setPath(ProjectPath)
      .addSuccess(GitStatesResponse)
      .addError(Unauthorized)
      .addError(NotFound)
  )
  .add(
    HttpApiEndpoint.get(
      "listBranches",
      "/orgs/:orgSlug/projects/:slug/github/branches"
    )
      .setPath(ProjectPath)
      .setUrlParams(
        Schema.Struct({
          q: Schema.optional(Schema.String),
          first: Schema.optional(Schema.NumberFromString)
        })
      )
      .addSuccess(BranchListResponse)
      .addError(Unauthorized)
      .addError(NotFound)
      .addError(GitHubTokenExpired)
      .addError(GitHubScopeInsufficient)
      .addError(RepoGone)
      .addError(RateLimited)
      .addError(GitHubError)
  )
  .middleware(Authentication)

const TicketsGroup = HttpApiGroup.make("tickets")
  .add(
    HttpApiEndpoint.get(
      "list",
      "/orgs/:orgSlug/projects/:slug/tickets"
    )
      .setPath(ProjectPath)
      .addSuccess(Schema.Array(Ticket))
      .addError(Unauthorized)
      .addError(NotFound)
  )
  .add(
    HttpApiEndpoint.post(
      "create",
      "/orgs/:orgSlug/projects/:slug/tickets"
    )
      .setPath(ProjectPath)
      .setPayload(CreateTicketInput)
      .addSuccess(Ticket)
      .addError(Unauthorized)
      .addError(NotFound)
  )
  .add(
    HttpApiEndpoint.get(
      "get",
      "/orgs/:orgSlug/projects/:slug/tickets/:id"
    )
      .setPath(TicketPath)
      .addSuccess(TicketDetail)
      .addError(Unauthorized)
      .addError(NotFound)
  )
  .add(
    HttpApiEndpoint.patch(
      "update",
      "/orgs/:orgSlug/projects/:slug/tickets/:id"
    )
      .setPath(TicketPath)
      .setPayload(UpdateTicketInput)
      .addSuccess(TicketDetail)
      .addError(Unauthorized)
      .addError(NotFound)
  )
  .add(
    HttpApiEndpoint.del(
      "delete",
      "/orgs/:orgSlug/projects/:slug/tickets/:id"
    )
      .setPath(TicketPath)
      .addError(Unauthorized)
      .addError(NotFound)
  )
  .add(
    HttpApiEndpoint.post(
      "createBranch",
      "/orgs/:orgSlug/projects/:slug/tickets/:id/branch"
    )
      .setPath(TicketPath)
      .setPayload(CreateBranchInput)
      .addSuccess(TicketDetail)
      .addError(Unauthorized)
      .addError(NotFound)
      .addError(Conflict)
      .addError(BranchExists)
      .addError(BranchProtected)
      .addError(GitHubTokenExpired)
      .addError(GitHubScopeInsufficient)
      .addError(RepoGone)
      .addError(RateLimited)
      .addError(GitHubError)
  )
  .add(
    HttpApiEndpoint.post(
      "openPr",
      "/orgs/:orgSlug/projects/:slug/tickets/:id/pr"
    )
      .setPath(TicketPath)
      .setPayload(OpenPrInput)
      .addSuccess(OpenPrResult)
      .addError(Unauthorized)
      .addError(NotFound)
      .addError(Conflict)
      .addError(BranchProtected)
      .addError(GitHubTokenExpired)
      .addError(GitHubScopeInsufficient)
      .addError(RepoGone)
      .addError(RateLimited)
      .addError(GitHubError)
  )
  .add(
    HttpApiEndpoint.del(
      "clearBranch",
      "/orgs/:orgSlug/projects/:slug/tickets/:id/branch"
    )
      .setPath(TicketPath)
      .addSuccess(TicketDetail)
      .addError(Unauthorized)
      .addError(NotFound)
  )
  .add(
    HttpApiEndpoint.post(
      "attachBranch",
      "/orgs/:orgSlug/projects/:slug/tickets/:id/attach-branch"
    )
      .setPath(TicketPath)
      .setPayload(AttachBranchInput)
      .addSuccess(TicketDetail)
      .addError(Unauthorized)
      .addError(NotFound)
      .addError(Forbidden)
      .addError(Conflict)
      .addError(BranchNotFound)
      .addError(GitHubTokenExpired)
      .addError(GitHubScopeInsufficient)
      .addError(RepoGone)
      .addError(RateLimited)
      .addError(GitHubError)
  )
  .middleware(Authentication)

const TagsGroup = HttpApiGroup.make("tags")
  .add(
    HttpApiEndpoint.get("list", "/orgs/:orgSlug/projects/:slug/tags")
      .setPath(ProjectPath)
      .addSuccess(Schema.Array(Tag))
      .addError(Unauthorized)
      .addError(NotFound)
  )
  .add(
    HttpApiEndpoint.post("create", "/orgs/:orgSlug/projects/:slug/tags")
      .setPath(ProjectPath)
      .setPayload(CreateTagInput)
      .addSuccess(Tag)
      .addError(Unauthorized)
      .addError(NotFound)
      .addError(Forbidden)
      .addError(Conflict)
  )
  .add(
    HttpApiEndpoint.patch("update", "/orgs/:orgSlug/projects/:slug/tags/:name")
      .setPath(ProjectTagPath)
      .setPayload(UpdateTagInput)
      .addSuccess(Tag)
      .addError(Unauthorized)
      .addError(NotFound)
      .addError(Forbidden)
      .addError(Conflict)
  )
  .add(
    HttpApiEndpoint.del("delete", "/orgs/:orgSlug/projects/:slug/tags/:name")
      .setPath(ProjectTagPath)
      .addSuccess(Schema.Void)
      .addError(Unauthorized)
      .addError(NotFound)
      .addError(Forbidden)
  )
  .middleware(Authentication)

const AppApi = HttpApi.make("projectproject")
  .add(HealthGroup)
  .add(DbGroup)
  .add(AuthGroup)
  .add(ProjectsGroup)
  .add(TicketsGroup)
  .add(TagsGroup)
  .annotateContext(OpenApi.annotations({ servers: [{ url: "/api" }] }))
export { AppApi }
