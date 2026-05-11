// packages/shared/src/errors.ts
//
// SHARED, OVER-THE-WIRE TAGGED ERRORS.
// ============================================================================
// Anything declared here is part of the API contract — both backend (which
// `addError(...)`s these on endpoints) and frontend (which pattern-matches on
// them after a typed-client call) import from this file.
//
// THE Schema.TaggedError vs Data.TaggedError DIVIDE
// ----------------------------------------------------------------------------
// Read this once and keep it in mind every time you create a new tagged error:
//
//   - `Schema.TaggedError` — has an underlying Schema. Encodes/decodes across
//     the wire. Required for any error referenced by `addError(...)` on an
//     `HttpApiEndpoint`. Lives in *this* file (or a sibling in `shared/`).
//
//   - `Data.TaggedError`   — plain class with structural equality. No Schema.
//     Used for *boundary* errors that get caught and translated before they
//     reach the wire. Lives next to the code that throws them, often in
//     `packages/backend/src/services/*.ts`.
//
// Concretely: `Unauthorized` here is `Schema.TaggedError` because it's
// returned to the client as a 401 body. `BetterAuthError` in
// `services/BetterAuth.ts` is `Data.TaggedError` because it's caught by the
// auth middleware and translated to `Unauthorized` before any response.
//
// HTTP STATUS BINDING
// ----------------------------------------------------------------------------
// `HttpApiSchema.annotations({ status: 401 })` tells `HttpApiBuilder` that
// when a handler fails with this error, the response should be a 401 with
// the error's encoded body as JSON. Without this, errors default to 500.
//
// CHAPTER 2 GOAL
// ----------------------------------------------------------------------------
// One error: `Unauthorized`, mapped to 401, no fields. Future chapters will
// add `NotFound`, `Forbidden`, `Conflict`, `ValidationError` here.

import { HttpApiSchema } from "@effect/platform"
import { Schema } from "effect"

export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  "Unauthorized",
  {},
  HttpApiSchema.annotations({ status: 401 })
) {}

export class NotFound extends Schema.TaggedError<NotFound>()(
  "NotFound",
  {},
  HttpApiSchema.annotations({ status: 404 })
) {}

// 403 — caller is authenticated and the resource exists, but their role
// doesn't permit the action. Distinct from `NotFound` (which we *also* use
// when a non-member hits a project — see Tickets service comment) so that
// existing-but-disallowed actions get a clear signal.
export class Forbidden extends Schema.TaggedError<Forbidden>()(
  "Forbidden",
  {},
  HttpApiSchema.annotations({ status: 403 })
) {}

// 409 — request conflicts with current state (e.g. branch already exists, repo
// already connected). Detail in `reason` so the UI can pick the right copy.
export class Conflict extends Schema.TaggedError<Conflict>()(
  "Conflict",
  { reason: Schema.String },
  HttpApiSchema.annotations({ status: 409 })
) {}

// 400 — caller-supplied input violates a domain invariant the schema can't
// express on its own (cross-field constraints like `endsAt >= startsAt`).
// Use `reason` to disambiguate (`invalid_interval`, ...).
export class Validation extends Schema.TaggedError<Validation>()(
  "Validation",
  { reason: Schema.String },
  HttpApiSchema.annotations({ status: 400 })
) {}

// --- GitHub-side errors -----------------------------------------------------
// Distinct from generic 4xx because the user-facing remedy is different
// (reconnect GitHub vs retry vs nothing). 502 is used for upstream failures
// where the GitHub API misbehaved; 401/403 split tracks token vs scope.

export class GitHubTokenExpired extends Schema.TaggedError<GitHubTokenExpired>()(
  "GitHubTokenExpired",
  {},
  HttpApiSchema.annotations({ status: 401 })
) {}

export class GitHubScopeInsufficient extends Schema.TaggedError<GitHubScopeInsufficient>()(
  "GitHubScopeInsufficient",
  {},
  HttpApiSchema.annotations({ status: 403 })
) {}

export class RepoGone extends Schema.TaggedError<RepoGone>()(
  "RepoGone",
  {},
  HttpApiSchema.annotations({ status: 410 })
) {}

export class BranchExists extends Schema.TaggedError<BranchExists>()(
  "BranchExists",
  { branch: Schema.String },
  HttpApiSchema.annotations({ status: 409 })
) {}

export class BranchProtected extends Schema.TaggedError<BranchProtected>()(
  "BranchProtected",
  { branch: Schema.String },
  HttpApiSchema.annotations({ status: 422 })
) {}

// Carries the unix-seconds reset timestamp so the UI can show a countdown.
export class RateLimited extends Schema.TaggedError<RateLimited>()(
  "RateLimited",
  { resetAt: Schema.Number },
  HttpApiSchema.annotations({ status: 429 })
) {}

// Catch-all for unexpected GitHub failures. `message` is whatever GitHub
// surfaced — fine to display verbatim, no PII.
export class GitHubError extends Schema.TaggedError<GitHubError>()(
  "GitHubError",
  { message: Schema.String },
  HttpApiSchema.annotations({ status: 502 })
) {}

// 404 — caller asked us to attach an existing branch but it isn't on the
// remote (deleted between list and submit, or typo). The UI should refresh
// the branch list and keep the form open.
export class BranchNotFound extends Schema.TaggedError<BranchNotFound>()(
  "BranchNotFound",
  { name: Schema.String },
  HttpApiSchema.annotations({ status: 404 })
) {}

export class SprintCompletedImmutable extends Schema.TaggedError<SprintCompletedImmutable>()(
  "SprintCompletedImmutable",
  {},
  HttpApiSchema.annotations({ status: 409 })
) {}
