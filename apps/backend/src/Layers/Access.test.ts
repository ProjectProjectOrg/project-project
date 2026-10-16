import { describe, expect, it } from "@effect/vitest"
import {
  accessLayer,
  orgScope,
  projectScope
} from "@pp/server-core/access/testing"
import {
  Authentication,
  CurrentUser,
  IncludeDeletedOrg,
  OrgAccess,
  OrgPath,
  OrgScope,
  ProjectAccess,
  ProjectPath,
  ProjectScope,
  RequiresOrg,
  RequiresProject,
  type OrgScopeShape,
  type ProjectScopeShape,
  User
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup
} from "effect/unstable/httpapi"

import { OrgAccessLive, ProjectAccessLive } from "./Access"

const OrgProbe = HttpApiGroup.make("org")
  .add(
    HttpApiEndpoint.get("member", "/orgs/:orgSlug/member", {
      params: OrgPath,
      success: Schema.String
    })
      .annotate(RequiresOrg, "membership")
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.post("storage", "/orgs/:orgSlug/storage", {
      params: OrgPath,
      success: Schema.String
    })
      .annotate(RequiresOrg, { storage: ["manage"] })
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.post("restore", "/orgs/:orgSlug/restore", {
      params: OrgPath,
      success: Schema.String
    })
      .annotate(RequiresOrg, "membership")
      .annotate(IncludeDeletedOrg, true)
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.get("undeclared", "/orgs/:orgSlug/undeclared", {
      params: OrgPath,
      success: Schema.String
    }).middleware(OrgAccess)
  )
  .middleware(Authentication)

const ProjectProbe = HttpApiGroup.make("project")
  .add(
    HttpApiEndpoint.get("read", "/orgs/:orgSlug/projects/:slug/read", {
      params: ProjectPath,
      success: Schema.String
    })
      .annotate(RequiresProject, "membership")
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.delete("remove", "/orgs/:orgSlug/projects/:slug/remove", {
      params: ProjectPath,
      success: Schema.String
    })
      .annotate(RequiresProject, { ticket: ["delete"] })
      .middleware(ProjectAccess)
  )
  .middleware(Authentication)

const ProbeApi = HttpApi.make("access-probe").add(OrgProbe).add(ProjectProbe)

const describeOrg = Effect.map(
  OrgScope,
  (scope) => `${scope.userId}:${scope.orgSlug}:${scope.role}`
)

const describeProject = Effect.map(
  ProjectScope,
  (scope) => `${scope.userId}:${scope.slug}:${scope.role}`
)

const OrgProbeLive = HttpApiBuilder.group(ProbeApi, "org", (handlers) =>
  handlers
    .handle("member", () => describeOrg)
    .handle("storage", () => describeOrg)
    .handle("restore", () => describeOrg)
    .handle("undeclared", () => describeOrg)
)

const ProjectProbeLive = HttpApiBuilder.group(ProbeApi, "project", (handlers) =>
  handlers
    .handle("read", () => describeProject)
    .handle("remove", () => describeProject)
)

const user = Schema.decodeSync(User)({
  id: "user-1",
  email: "u@example.com",
  name: "U",
  username: null,
  image: null,
  createdAt: "2026-09-25T00:00:00Z",
  activeOrgSlug: "acme",
  personalGithub: { connected: false },
  editorPreference: "github",
  personalEverhour: {
    connected: false,
    everhourUserId: null,
    name: null,
    email: null,
    lastVerifiedAt: null,
    lastCheckError: null
  }
})

const AuthenticationStub = Layer.succeed(Authentication, {
  sessionCookie: (httpEffect) =>
    Effect.provideService(httpEffect, CurrentUser, user)
})

type Scopes = Readonly<{
  org?: OrgScopeShape
  projects?: ReadonlyArray<ProjectScopeShape>
}>

type Reply = Readonly<{ status: number; body: string }>

const send = (scopes: Scopes, method: string, path: string) =>
  Effect.acquireUseRelease(
    Effect.sync(() =>
      HttpRouter.toWebHandler(
        HttpApiBuilder.layer(ProbeApi).pipe(
          Layer.provide([OrgProbeLive, ProjectProbeLive]),
          Layer.provide([OrgAccessLive, ProjectAccessLive]),
          Layer.provide([accessLayer(scopes), AuthenticationStub]),
          Layer.provideMerge(HttpServer.layerServices)
        ),
        { disableLogger: true }
      )
    ),
    ({ handler }) =>
      Effect.promise(async (): Promise<Reply> => {
        const response = await handler(
          new Request(`http://localhost${path}`, {
            method,
            headers: { cookie: "better-auth.session_token=t" }
          })
        )
        return { status: response.status, body: await response.text() }
      }),
    ({ dispose }) => Effect.promise(dispose)
  )

describe("OrgAccess", () => {
  it.effect("provides the caller's org scope to the handler", () =>
    Effect.gen(function* () {
      const reply = yield* send(
        { org: orgScope("guest") },
        "GET",
        "/orgs/acme/member"
      )
      expect(reply).toStrictEqual({
        status: 200,
        body: `"user-1:acme:guest"`
      })
    })
  )

  it.effect("hides an org the caller does not belong to", () =>
    Effect.gen(function* () {
      const reply = yield* send(
        { org: orgScope("owner") },
        "GET",
        "/orgs/elsewhere/member"
      )
      expect(reply.status).toBe(404)
    })
  )

  it.effect("rejects a malformed org slug as not found", () =>
    Effect.gen(function* () {
      const reply = yield* send(
        { org: orgScope("owner") },
        "GET",
        "/orgs/Not_A_Slug/member"
      )
      expect(reply.status).toBe(404)
    })
  )

  it.effect.each(["owner", "admin"] as const)(
    "lets %s past a grant it holds",
    (role) =>
      Effect.gen(function* () {
        const reply = yield* send(
          { org: orgScope(role) },
          "POST",
          "/orgs/acme/storage"
        )
        expect(reply.status).toBe(200)
      })
  )

  it.effect.each(["member", "guest"] as const)(
    "refuses %s a grant it lacks",
    (role) =>
      Effect.gen(function* () {
        const reply = yield* send(
          { org: orgScope(role) },
          "POST",
          "/orgs/acme/storage"
        )
        expect(reply.status).toBe(403)
      })
  )

  it.effect("reaches a deleted org only where the endpoint allows it", () =>
    Effect.gen(function* () {
      const deleted = {
        org: orgScope("owner", {
          deletedAt: DateTime.toDate(DateTime.makeUnsafe(0))
        })
      }
      const member = yield* send(deleted, "GET", "/orgs/acme/member")
      const restore = yield* send(deleted, "POST", "/orgs/acme/restore")
      expect([member.status, restore.status]).toStrictEqual([404, 200])
    })
  )

  it.effect("refuses to guess when an endpoint declares no requirement", () =>
    Effect.gen(function* () {
      const reply = yield* send(
        { org: orgScope("owner") },
        "GET",
        "/orgs/acme/undeclared"
      )
      expect(reply.status).toBe(500)
    })
  )
})

describe("ProjectAccess", () => {
  it.effect("provides the caller's project scope to the handler", () =>
    Effect.gen(function* () {
      const reply = yield* send(
        { projects: [projectScope("member", "client")] },
        "GET",
        "/orgs/acme/projects/website/read"
      )
      expect(reply).toStrictEqual({
        status: 200,
        body: `"user-1:website:client"`
      })
    })
  )

  it.effect("hides a project the caller cannot see", () =>
    Effect.gen(function* () {
      const reply = yield* send(
        { projects: [projectScope("member", "pm")] },
        "GET",
        "/orgs/acme/projects/other/read"
      )
      expect(reply.status).toBe(404)
    })
  )

  it.effect("checks the endpoint's grants against the project role", () =>
    Effect.gen(function* () {
      const pm = yield* send(
        { projects: [projectScope("member", "pm")] },
        "DELETE",
        "/orgs/acme/projects/website/remove"
      )
      const developer = yield* send(
        { projects: [projectScope("member", "developer")] },
        "DELETE",
        "/orgs/acme/projects/website/remove"
      )
      expect([pm.status, developer.status]).toStrictEqual([200, 403])
    })
  )
})
