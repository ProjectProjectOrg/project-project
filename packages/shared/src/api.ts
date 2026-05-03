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

import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "@effect/platform"
import { Schema } from "effect"
import { User } from "./schemas/User"
import {
  CreateProjectInput,
  Project,
  ProjectDetail,
  Slug,
  UpdateProjectInput
} from "./schemas/Project"
import { NotFound, Unauthorized } from "./errors"
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
  )
  .add(
    HttpApiEndpoint
      .del("delete", "/projects/:slug")
      .setPath(Schema.Struct({ slug: Slug }))
      .addError(Unauthorized)
      .addError(NotFound)
  )
  .middleware(Authentication)

const AppApi = HttpApi
  .make("projectproject")
  .add(HealthGroup)
  .add(DbGroup)
  .add(AuthGroup)
  .add(ProjectsGroup)
export { AppApi }
