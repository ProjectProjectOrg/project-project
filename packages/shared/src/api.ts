// packages/shared/src/api.ts
//
// THIS FILE IS THE CONTRACT.
// ----------------------------------------------------------------------------
// Markmate's HTTP API is defined here, once. The backend implements it; the
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

// TODO: import HttpApi, HttpApiGroup, HttpApiEndpoint from "@effect/platform"
// TODO: import { Schema } from "effect"

// TODO: define a `HealthResponse` schema = Schema.Struct({ status: Schema.Literal("ok") })

// TODO: declare `const HealthGroup = HttpApiGroup.make("health").add(...)`

// TODO: export `const AppApi = HttpApi.make("markmate").add(HealthGroup)`

export {} // Remove this line once you start exporting AppApi.
