// packages/shared/src/api.ts
//
// THIS FILE IS THE CONTRACT.
// ----------------------------------------------------------------------------
// ProjectProject's HTTP API is defined here, once. The backend implements it; the
// frontend consumes it via `HttpApiClient.make(AppApi)`; the OpenAPI spec is
// derived from it. There is no code generation step — the *type* of `AppApi`
// is what flows into both ends.
//
// You will revisit this file in nearly every chapter, adding a new group or
// a new endpoint each time. For Chapter 0, your job is to declare the
// smallest possible API: a single `GET /health` endpoint that returns
// `{ status: "ok" }`.
//
// CONCEPTS USED HERE (look these up while you implement)
// ----------------------------------------------------------------------------
// - `HttpApi.make("name")`           — creates the top-level API description
// - `HttpApiGroup.make("name")`      — groups related endpoints (later: auth,
//                                      projects, tickets). Even one endpoint
//                                      lives inside a group.
// - `HttpApiEndpoint.get(name, path)` — declares a GET endpoint
// - `.addSuccess(schema)`            — declares the success response shape
// - `.addError(schema)`              — declares a failure variant (later)
// - `Schema.Struct({...})`           — describes an object shape
// - `Schema.Literal("ok")`           — narrows a string to an exact value
//
// IMPORTANT
// ----------------------------------------------------------------------------
// In Effect v3 stable, `Schema` is imported from the main `effect` package
// (not `@effect/schema`). The spec uses `import { Schema as S } from "effect"`.
//
// Do NOT implement the endpoint here. This file describes shapes only;
// implementations live in `packages/backend/src/main.ts` (and later, the
// `handlers/` directory).

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
  CreateBranchInput,
  GitStatesResponse,
  OpenPrInput,
  OpenPrResult
} from "./schemas/GitState"
import { PullRequestReviewBundle } from "./schemas/Review"
import {
  BranchExists,
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

const HealthGroup = HttpApiGroup
  .make("health")
  .add(
    HttpApiEndpoint
      .get("get", "/health")
      .addSuccess(HealthResponse)
  )

const DbPingResponse = Schema.Struct({
  projectCount: Schema.Number
})
export type DbPingResponse = typeof DbPingResponse.Type

const DbGroup = HttpApiGroup
  .make("db")
  .add(
    HttpApiEndpoint
      .get("ping", "/db/ping")
      .addSuccess(DbPingResponse)
  )

const AuthGroup = HttpApiGroup
  .make("auth")
  .add(
    HttpApiEndpoint
      .get("me", "/me")
      .addSuccess(User)
      .addError(Unauthorized)
  )
  .middleware(Authentication)

const ProjectsGroup = HttpApiGroup
  .make("projects")
  .add(
    HttpApiEndpoint
      .get("list", "/projects")
      .addSuccess(Schema.Array(Project))
      .addError(Unauthorized)
  )
  .add(
    HttpApiEndpoint
      .post("create", "/projects")
      .setPayload(CreateProjectInput)
      .addSuccess(Project)
      .addError(Unauthorized)
  )
  .add(
    HttpApiEndpoint
      .get("get", "/projects/:slug")
      .setPath(Schema.Struct({ slug: Slug }))
      .addSuccess(ProjectDetail)
      .addError(Unauthorized)
      .addError(NotFound)
  )
  .add(
    HttpApiEndpoint
      .patch("update", "/projects/:slug")
      .setPath(Schema.Struct({ slug: Slug }))
      .setPayload(UpdateProjectInput)
      .addSuccess(ProjectDetail)
      .addError(Unauthorized)
      .addError(NotFound)
      .addError(Forbidden)
  )
  .add(
    HttpApiEndpoint
      .del("delete", "/projects/:slug")
      .setPath(Schema.Struct({ slug: Slug }))
      .addError(Unauthorized)
      .addError(NotFound)
      .addError(Forbidden)
  )
  .add(
    HttpApiEndpoint
      .post("addMember", "/projects/:slug/members")
      .setPath(Schema.Struct({ slug: Slug }))
      .setPayload(AddMemberInput)
      .addSuccess(ProjectDetail)
      .addError(Unauthorized)
      .addError(NotFound)
      .addError(Forbidden)
  )
  .add(
    HttpApiEndpoint
      .patch("updateMember", "/projects/:slug/members/:userId")
      .setPath(Schema.Struct({ slug: Slug, userId: Schema.String }))
      .setPayload(UpdateMemberInput)
      .addSuccess(ProjectDetail)
      .addError(Unauthorized)
      .addError(NotFound)
      .addError(Forbidden)
  )
  .add(
    HttpApiEndpoint
      .del("removeMember", "/projects/:slug/members/:userId")
      .setPath(Schema.Struct({ slug: Slug, userId: Schema.String }))
      .addSuccess(ProjectDetail)
      .addError(Unauthorized)
      .addError(NotFound)
      .addError(Forbidden)
  )
  // --- GitHub connection ----------------------------------------------------
  // Connect/disconnect a repo to a project. Connect verifies push access via
  // Octokit before persisting, so a successful response means the user can
  // actually create branches and open PRs.
  .add(
    HttpApiEndpoint
      .post("connectGithub", "/projects/:slug/github")
      .setPath(Schema.Struct({ slug: Slug }))
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
    HttpApiEndpoint
      .del("disconnectGithub", "/projects/:slug/github")
      .setPath(Schema.Struct({ slug: Slug }))
      .addSuccess(ProjectDetail)
      .addError(Unauthorized)
      .addError(NotFound)
      .addError(Forbidden)
  )
  // List the user's repos for the picker. q is a free-text filter, page is
  // 1-indexed. Returns hasMore so the picker can lazy-load.
  .add(
    HttpApiEndpoint
      .get("listRepos", "/github/repos")
      .setUrlParams(Schema.Struct({
        q: Schema.optional(Schema.String),
        page: Schema.optional(Schema.NumberFromString)
      }))
      .addSuccess(GithubRepoPage)
      .addError(Unauthorized)
      .addError(GitHubTokenExpired)
      .addError(GitHubScopeInsufficient)
      .addError(GitHubError)
  )
  // Per-project git states (branch + PR) for every ticket. One batched
  // GraphQL call backs this. UI calls this on project page load and after
  // any branch/PR mutation; ~30s atom TTL otherwise.
  .add(
    HttpApiEndpoint
      .get("gitStates", "/projects/:slug/git-states")
      .setPath(Schema.Struct({ slug: Slug }))
      .addSuccess(GitStatesResponse)
      .addError(Unauthorized)
      .addError(NotFound)
  )
  .middleware(Authentication)

const TicketsGroup = HttpApiGroup
  .make("tickets")
  .add(
    HttpApiEndpoint
      .get("list", "/projects/:slug/tickets")
      .setPath(Schema.Struct({ slug: Slug }))
      .addSuccess(Schema.Array(Ticket))
      .addError(Unauthorized)
      .addError(NotFound)
  )
  .add(
    HttpApiEndpoint
      .post("create", "/projects/:slug/tickets")
      .setPath(Schema.Struct({ slug: Slug }))
      .setPayload(CreateTicketInput)
      .addSuccess(Ticket)
      .addError(Unauthorized)
      .addError(NotFound)
  )
  .add(
    HttpApiEndpoint
      .get("get", "/projects/:slug/tickets/:id")
      .setPath(Schema.Struct({ slug: Slug, id: TicketId }))
      .addSuccess(TicketDetail)
      .addError(Unauthorized)
      .addError(NotFound)
  )
  .add(
    HttpApiEndpoint
      .patch("update", "/projects/:slug/tickets/:id")
      .setPath(Schema.Struct({ slug: Slug, id: TicketId }))
      .setPayload(UpdateTicketInput)
      .addSuccess(TicketDetail)
      .addError(Unauthorized)
      .addError(NotFound)
  )
  .add(
    HttpApiEndpoint
      .del("delete", "/projects/:slug/tickets/:id")
      .setPath(Schema.Struct({ slug: Slug, id: TicketId }))
      .addError(Unauthorized)
      .addError(NotFound)
  )
  // --- Branch & PR operations ----------------------------------------------
  // Each call writes the resulting branch / PR number back to the ticket
  // markdown. Errors map to inline UI states on the ticket detail panel.
  .add(
    HttpApiEndpoint
      .post("createBranch", "/projects/:slug/tickets/:id/branch")
      .setPath(Schema.Struct({ slug: Slug, id: TicketId }))
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
    HttpApiEndpoint
      .post("openPr", "/projects/:slug/tickets/:id/pr")
      .setPath(Schema.Struct({ slug: Slug, id: TicketId }))
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
    HttpApiEndpoint
      .del("clearBranch", "/projects/:slug/tickets/:id/branch")
      .setPath(Schema.Struct({ slug: Slug, id: TicketId }))
      .addSuccess(TicketDetail)
      .addError(Unauthorized)
      .addError(NotFound)
  )
  .middleware(Authentication)

const ReviewsGroup = HttpApiGroup
  .make("reviews")
  .add(
    HttpApiEndpoint
      .get("getForTicket", "/projects/:slug/tickets/:id/review")
      .setPath(Schema.Struct({ slug: Slug, id: TicketId }))
      .addSuccess(PullRequestReviewBundle)
      .addError(Unauthorized)
      .addError(NotFound)
      .addError(Conflict)
      .addError(GitHubTokenExpired)
      .addError(GitHubScopeInsufficient)
      .addError(RepoGone)
      .addError(RateLimited)
      .addError(GitHubError)
  )
  .middleware(Authentication)

// Swagger UI's "Try it out" prepends `servers[0].url` to each operation's
// path. Without it, requests go to `/projects/...` instead of `/api/projects/...`
// (the actual mount in packages/backend/src/main.ts). Only affects the
// generated OpenAPI spec — HttpApiClient ignores this annotation and uses
// its own `baseUrl` option.
const AppApi = HttpApi
  .make("projectproject")
  .add(HealthGroup)
  .add(DbGroup)
  .add(AuthGroup)
  .add(ProjectsGroup)
  .add(TicketsGroup)
  .add(ReviewsGroup)
  .annotateContext(OpenApi.annotations({ servers: [{ url: "/api" }] }))
export { AppApi }
