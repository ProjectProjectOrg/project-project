import { it } from "@effect/vitest"
import {
  accessLayer,
  orgScope,
  projectScope
} from "@pp/server-core/access/testing"
import * as Library from "@pp/server-core/library/Library"
import * as Markdown from "@pp/server-core/markdown/Markdown"
import {
  ActivityActor,
  AppApi,
  Authentication,
  BUILTIN_BLOCKS,
  Conflict,
  CurrentUser,
  NotFound,
  type BlockDefinition,
  type Library as LibraryValue,
  type OrgRole,
  type Role,
  type TypeDefinition,
  UserId,
  TypeKey,
  OrgScope,
  ProjectScope
} from "@pp/shared"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import { HttpRouter, HttpServer } from "effect/http"
import { HttpApi, HttpApiBuilder } from "effect/http-api"
import * as Layer from "effect/Layer"
import * as Match from "effect/Match"
import * as Schema from "effect/Schema"
import { afterAll, beforeEach, expect } from "vitest"

import { OrgAccessLive, ProjectAccessLive } from "../access/AccessMiddleware"
import { LibraryHandlerLive } from "./Handlers"

type Call = Readonly<{
  method: string
  args: ReadonlyArray<unknown>
  layer: string
}>

const USER_ID = "user-1"
const calls: Array<Call> = []

const inOrgScope = <A, E>(
  method: string,
  args: ReadonlyArray<unknown>,
  result: Effect.Effect<A, E>
) =>
  Effect.flatMap(OrgScope, (scope) => {
    calls.push({ method, args, layer: scope.orgSlug })
    return result
  })

const inProjectScope = <A, E>(
  method: string,
  args: ReadonlyArray<unknown>,
  result: Effect.Effect<A, E>
) =>
  Effect.flatMap(ProjectScope, (scope) => {
    calls.push({ method, args, layer: `${scope.orgSlug}/${scope.slug}` })
    return result
  })

const block: BlockDefinition = {
  ...BUILTIN_BLOCKS[0],
  origin: "org",
  shadows: null,
  hidden: false
}

const type: TypeDefinition = {
  key: TypeKey.make("spike"),
  name: "Spike",
  icon: "Bug",
  color: null,
  description: "",
  priority: null,
  tags: [],
  body: "",
  origin: "project",
  shadows: null,
  hidden: false
}

const library: LibraryValue = {
  blocks: [block],
  types: [type],
  canEdit: true
}

const failFor = <A>(
  key: string,
  value: A
): Effect.Effect<A, NotFound | Markdown.MarkdownError> =>
  Match.value(key).pipe(
    Match.when("missing", () => Effect.fail(new NotFound())),
    Match.when("broken", () =>
      Effect.fail(new Markdown.MarkdownError({ cause: null, message: "disk" }))
    ),
    Match.orElse(() => Effect.succeed(value))
  )

const fakeLibrary: Library.Library["Service"] = {
  orgLibrary: () => inOrgScope("orgLibrary", [], Effect.succeed(library)),
  projectLibrary: () =>
    inProjectScope("projectLibrary", [], Effect.succeed(library)),
  createOrgBlock: (...args) =>
    inOrgScope(
      "createOrgBlock",
      args,
      args[0].key === "taken"
        ? Effect.fail(new Conflict({ reason: "key_taken" }))
        : Effect.succeed(block)
    ),
  updateOrgBlock: (...args) =>
    inOrgScope("updateOrgBlock", args, failFor(args[0], block)),
  removeOrgBlock: (...args) =>
    inOrgScope("removeOrgBlock", args, failFor(args[0], undefined)),
  createOrgType: (...args) =>
    inOrgScope("createOrgType", args, Effect.succeed(type)),
  updateOrgType: (...args) =>
    inOrgScope("updateOrgType", args, failFor(args[0], type)),
  removeOrgType: (...args) =>
    inOrgScope("removeOrgType", args, failFor(args[0], undefined)),
  createBlock: (...args) =>
    inProjectScope("createBlock", args, Effect.succeed(block)),
  updateBlock: (...args) =>
    inProjectScope("updateBlock", args, failFor(args[0], block)),
  removeBlock: (...args) =>
    inProjectScope("removeBlock", args, failFor(args[0], undefined)),
  hideBlock: (...args) =>
    inProjectScope("hideBlock", args, failFor(args[0], undefined)),
  createType: (...args) =>
    inProjectScope("createType", args, Effect.succeed(type)),
  updateType: (...args) =>
    inProjectScope("updateType", args, failFor(args[0], type)),
  removeType: (...args) =>
    inProjectScope("removeType", args, failFor(args[0], undefined)),
  hideType: (...args) =>
    inProjectScope("hideType", args, failFor(args[0], undefined)),
  expandForCreate: () => Effect.die("unexpected"),
  typeKeys: () => Effect.die("unexpected"),
  untouchedBodyCheck: () => Effect.die("unexpected"),
  resolveSynced: () => Effect.die("unexpected")
}

const services = Context.make(Library.Library, fakeLibrary)

const TestApi = HttpApi.make(AppApi.identifier).add(AppApi.groups.library)

const apiFor = (orgRole: OrgRole, projectRole: Role) =>
  HttpRouter.toWebHandler(
    HttpApiBuilder.layer(TestApi).pipe(
      Layer.provide(LibraryHandlerLive),
      Layer.provide(
        Layer.mergeAll(OrgAccessLive, ProjectAccessLive).pipe(
          Layer.provide(
            accessLayer({
              org: orgScope(orgRole, { userId: USER_ID }),
              projects: [
                projectScope(orgRole, projectRole, {
                  userId: USER_ID,
                  slug: "web"
                })
              ]
            })
          )
        )
      ),
      Layer.provide(
        Layer.succeed(Authentication, {
          sessionCookie: (httpEffect) =>
            httpEffect.pipe(
              Effect.provideService(CurrentUser, {
                id: UserId.make(USER_ID),
                email: "u@example.com",
                name: "U",
                username: null,
                image: null,
                createdAt: DateTime.toDate(DateTime.makeUnsafe(0))
              }),
              Effect.provideService(ActivityActor, ActivityActor.user(USER_ID))
            )
        })
      ),
      Layer.provideMerge(HttpServer.layerServices)
    )
  )

type TestApp = ReturnType<typeof apiFor>

const ownerApp = apiFor("owner", "pm")
const adminApp = apiFor("admin", "pm")
const pmApp = apiFor("member", "pm")
const developerApp = apiFor("member", "developer")

afterAll(() =>
  Promise.all(
    [ownerApp, adminApp, pmApp, developerApp].map((app) => app.dispose())
  )
)
beforeEach(() => {
  calls.length = 0
})

const sendAs = (
  app: TestApp,
  method: string,
  path: string,
  body?: Schema.Json
) =>
  Effect.promise(() =>
    app.handler(
      new Request(`http://localhost${path}`, {
        method,
        headers: {
          cookie: "better-auth.session_token=t",
          ...(body === undefined ? {} : { "content-type": "application/json" })
        },
        ...(body === undefined ? {} : { body: encodeJson(body) })
      }),
      services
    )
  )

const send = (method: string, path: string, body?: Schema.Json) =>
  sendAs(ownerApp, method, path, body)

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))

const json = (response: Response) => Effect.promise(() => response.json())

const typeDraft = (key: string) => ({
  key,
  name: "Spike",
  icon: "Telescope",
  color: null,
  description: "",
  priority: null,
  tags: [],
  body: ""
})

const draft = (key: string) => ({
  key,
  name: "Acceptance",
  icon: "ListChecks",
  color: null,
  description: "",
  sync: false,
  content: "## Acceptance criteria"
})

it.effect("returns the org and project libraries for the caller", () =>
  Effect.gen(function* () {
    const org = yield* send("GET", "/orgs/acme/library")
    expect(org.status).toBe(200)
    expect(yield* json(org)).toMatchObject({ canEdit: true })
    const project = yield* send("GET", "/orgs/acme/projects/web/library")
    expect(project.status).toBe(200)
    expect(calls).toEqual([
      { method: "orgLibrary", args: [], layer: "acme" },
      { method: "projectLibrary", args: [], layer: "acme/web" }
    ])
  })
)

it.effect("routes org paths to the org layer and project paths to theirs", () =>
  Effect.gen(function* () {
    const orgCreate = yield* send(
      "POST",
      "/orgs/acme/library/blocks",
      draft("acceptance")
    )
    expect(orgCreate.status).toBe(200)
    const projectCreate = yield* send(
      "POST",
      "/orgs/acme/projects/web/library/blocks",
      draft("acceptance")
    )
    expect(projectCreate.status).toBe(200)
    expect(calls.map(({ method, layer }) => [method, layer])).toEqual([
      ["createOrgBlock", "acme"],
      ["createBlock", "acme/web"]
    ])
  })
)

it.effect("passes the key through update, remove and hide", () =>
  Effect.gen(function* () {
    const update = yield* send(
      "PATCH",
      "/orgs/acme/projects/web/library/types/spike",
      { name: "Bug" }
    )
    expect(update.status).toBe(200)
    const remove = yield* send("DELETE", "/orgs/acme/library/blocks/acceptance")
    expect(remove.status).toBe(204)
    const hide = yield* send(
      "POST",
      "/orgs/acme/projects/web/library/types/spike/hide"
    )
    expect(hide.status).toBe(204)
    expect(calls).toEqual([
      {
        method: "updateType",
        args: ["spike", { name: "Bug" }],
        layer: "acme/web"
      },
      { method: "removeOrgBlock", args: ["acceptance"], layer: "acme" },
      { method: "hideType", args: ["spike"], layer: "acme/web" }
    ])
  })
)

it.effect("has no hide endpoint at the org layer", () =>
  Effect.gen(function* () {
    const hide = yield* send("POST", "/orgs/acme/library/blocks/notes/hide")
    expect(hide.status).toBe(404)
    expect(calls).toEqual([])
  })
)

it.effect("maps service failures to their HTTP statuses", () =>
  Effect.gen(function* () {
    const missing = yield* send("DELETE", "/orgs/acme/library/types/missing")
    expect(missing.status).toBe(404)
    const taken = yield* send(
      "POST",
      "/orgs/acme/library/blocks",
      draft("taken")
    )
    expect(taken.status).toBe(409)
    expect(yield* json(taken)).toEqual({
      _tag: "Conflict",
      reason: "key_taken"
    })
    const broken = yield* send(
      "POST",
      "/orgs/acme/projects/web/library/blocks/broken/hide"
    )
    expect(broken.status).toBe(500)
  })
)

it.effect(
  "hides unknown orgs and rejects malformed keys before the service",
  () =>
    Effect.gen(function* () {
      const unknownOrg = yield* send("GET", "/orgs/other/library")
      expect(unknownOrg.status).toBe(404)
      const badKey = yield* send("DELETE", "/orgs/acme/library/blocks/Bad_Key")
      expect(badKey.status).toBe(400)
      for (const reserved of ["blank", "other"]) {
        const hide = yield* send(
          "POST",
          `/orgs/acme/projects/web/library/types/${reserved}/hide`
        )
        expect(hide.status).toBe(400)
        const create = yield* send("POST", "/orgs/acme/library/types", {
          ...typeDraft("spike"),
          key: reserved
        })
        expect(create.status).toBe(400)
      }
      expect(calls).toEqual([])
    })
)

it.effect("has no template or default-template endpoints", () =>
  Effect.gen(function* () {
    for (const [method, path] of [
      ["POST", "/orgs/acme/library/templates"],
      ["PATCH", "/orgs/acme/library/defaults"],
      ["POST", "/orgs/acme/projects/web/library/templates"],
      ["PATCH", "/orgs/acme/projects/web/library/defaults"]
    ] as const) {
      const response = yield* send(method, path, typeDraft("spike"))
      expect(response.status).toBe(404)
    }
    expect(calls).toEqual([])
  })
)

const orgTypeRequests = [
  ["POST", "/orgs/acme/library/types", typeDraft("spike")],
  ["PATCH", "/orgs/acme/library/types/spike", { name: "Research" }],
  ["DELETE", "/orgs/acme/library/types/spike", undefined]
] as const

const projectTypeRequests = [
  ["POST", "/orgs/acme/projects/web/library/types", typeDraft("spike")],
  ["PATCH", "/orgs/acme/projects/web/library/types/spike", { name: "R" }],
  ["POST", "/orgs/acme/projects/web/library/types/bug/hide", undefined],
  ["DELETE", "/orgs/acme/projects/web/library/types/bug", undefined]
] as const

it.effect("lets org owners and admins manage org types, not members", () =>
  Effect.gen(function* () {
    for (const app of [ownerApp, adminApp])
      for (const [method, path, body] of orgTypeRequests)
        expect((yield* sendAs(app, method, path, body)).status).toBeLessThan(
          300
        )
    expect(calls.map((call) => call.method)).toEqual([
      "createOrgType",
      "updateOrgType",
      "removeOrgType",
      "createOrgType",
      "updateOrgType",
      "removeOrgType"
    ])
    calls.length = 0
    for (const app of [pmApp, developerApp])
      for (const [method, path, body] of orgTypeRequests)
        expect((yield* sendAs(app, method, path, body)).status).toBe(403)
    expect(
      (yield* sendAs(developerApp, "GET", "/orgs/acme/library")).status
    ).toBe(200)
    expect(calls.map((call) => call.method)).toEqual(["orgLibrary"])
  })
)

it.effect("lets a project pm manage project types, not a developer", () =>
  Effect.gen(function* () {
    for (const [method, path, body] of projectTypeRequests)
      expect((yield* sendAs(pmApp, method, path, body)).status).toBeLessThan(
        300
      )
    expect(calls.map((call) => call.method)).toEqual([
      "createType",
      "updateType",
      "hideType",
      "removeType"
    ])
    calls.length = 0
    for (const [method, path, body] of projectTypeRequests)
      expect((yield* sendAs(developerApp, method, path, body)).status).toBe(403)
    expect(
      (yield* sendAs(developerApp, "GET", "/orgs/acme/projects/web/library"))
        .status
    ).toBe(200)
    expect(calls.map((call) => call.method)).toEqual(["projectLibrary"])
  })
)
