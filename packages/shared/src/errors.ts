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
