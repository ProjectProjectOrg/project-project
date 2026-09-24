import { it } from "@effect/vitest"
import { accessLayer, orgScope } from "@pp/server-core/access/testing"
import { Library, type LibraryShape } from "@pp/server-core/library/Library"
import { MarkdownError } from "@pp/server-core/markdown/Markdown"
import { CurrentOrg } from "@pp/server-core/organizations/CurrentOrg"
import {
  AppApi,
  Authentication,
  BUILTIN_BLOCKS,
  Conflict,
  CurrentUser,
  Forbidden,
  NotFound,
  type BlockDefinition,
  type Library as LibraryValue,
  type TemplateDefinition,
  type UserId
} from "@pp/shared"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { afterAll, beforeEach, expect } from "vitest"

import { OrgAccessLive } from "../Layers/Access"
import { LibraryHandlerLive } from "./library"

type Call = Readonly<{ method: string; args: ReadonlyArray<unknown> }>

const USER_ID = "user-1"
const calls: Array<Call> = []

const record = (method: string, args: ReadonlyArray<unknown>) => {
  calls.push({ method, args })
}

const block: BlockDefinition = {
  ...BUILTIN_BLOCKS[0]!,
  origin: "org",
  shadows: null,
  hidden: false
}

const template: TemplateDefinition = {
  key: "bug-report" as TemplateDefinition["key"],
  name: "Bug report",
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
  templates: [template],
  defaults: { feat: null, bug: template.key, chore: null, other: null },
  ownDefaults: { bug: template.key },
  inheritedDefaults: { feat: null, bug: null, chore: null, other: null },
  canEdit: true
}

const libraryDefaults = {
  defaults: library.defaults,
  ownDefaults: library.ownDefaults,
  inheritedDefaults: library.inheritedDefaults
}

const failFor = <A>(
  key: string,
  value: A
): Effect.Effect<A, Forbidden | NotFound | MarkdownError> =>
  key === "forbidden"
    ? Effect.fail(new Forbidden())
    : key === "missing"
      ? Effect.fail(new NotFound())
      : key === "broken"
        ? Effect.fail(new MarkdownError({ cause: null, message: "disk" }))
        : Effect.succeed(value)

const fakeLibrary: LibraryShape = {
  orgLibrary: (...args) => {
    record("orgLibrary", args)
    return Effect.succeed(library)
  },
  projectLibrary: (...args) => {
    record("projectLibrary", args)
    return Effect.succeed(library)
  },
  createBlock: (...args) => {
    record("createBlock", args)
    return args[3].key === "taken"
      ? Effect.fail(new Conflict({ reason: "key_taken" }))
      : Effect.succeed(block)
  },
  updateBlock: (...args) => {
    record("updateBlock", args)
    return failFor(args[3], block)
  },
  removeBlock: (...args) => {
    record("removeBlock", args)
    return failFor(args[3], undefined)
  },
  hideBlock: (...args) => {
    record("hideBlock", args)
    return failFor(args[3], undefined)
  },
  createTemplate: (...args) => {
    record("createTemplate", args)
    return Effect.succeed(template)
  },
  updateTemplate: (...args) => {
    record("updateTemplate", args)
    return failFor(args[3], template)
  },
  removeTemplate: (...args) => {
    record("removeTemplate", args)
    return failFor(args[3], undefined)
  },
  hideTemplate: (...args) => {
    record("hideTemplate", args)
    return failFor(args[3], undefined)
  },
  setOrgTemplateDefaults: (...args) => {
    record("setOrgTemplateDefaults", args)
    return Effect.succeed(libraryDefaults)
  },
  setTemplateDefaults: (...args) => {
    record("setTemplateDefaults", args)
    return Effect.succeed(libraryDefaults)
  },
  expandForCreate: () => Effect.die("unexpected"),
  resolveSynced: () => Effect.die("unexpected")
}

const services = Context.make(Library, fakeLibrary).pipe(
  Context.add(CurrentOrg, {
    resolve: (orgSlug: string, _userId: string) =>
      orgSlug === "acme"
        ? Effect.succeed({
            organizationId: "o1",
            orgSlug,
            role: "owner" as const
          })
        : Effect.fail(new NotFound())
  })
)

const TestApi = HttpApi.make(AppApi.identifier).add(AppApi.groups.library)

const ApiUnderTestLive = HttpApiBuilder.layer(TestApi).pipe(
  Layer.provide(LibraryHandlerLive),
  Layer.provide(
    OrgAccessLive.pipe(
      Layer.provide(
        accessLayer({ org: orgScope("owner", { userId: USER_ID }) })
      )
    )
  ),
  Layer.provide(
    Layer.succeed(Authentication, {
      sessionCookie: (httpEffect) =>
        Effect.provideService(httpEffect, CurrentUser, {
          id: USER_ID as UserId,
          email: "u@example.com",
          name: "U",
          username: null,
          image: null,
          createdAt: DateTime.toDate(DateTime.makeUnsafe(0)),
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
    })
  )
)

const { handler, dispose } = HttpRouter.toWebHandler(
  ApiUnderTestLive.pipe(Layer.provideMerge(HttpServer.layerServices))
)

afterAll(() => dispose())
beforeEach(() => {
  calls.length = 0
})

const send = (method: string, path: string, body?: unknown) =>
  Effect.promise(() =>
    handler(
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

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))

const json = (response: Response) => Effect.promise(() => response.json())

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
      { method: "orgLibrary", args: ["acme", USER_ID] },
      { method: "projectLibrary", args: ["acme", USER_ID, "web"] }
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
    expect(calls.map(({ args }) => args[2])).toEqual([null, "web"])
  })
)

it.effect("passes the key through update, remove and hide", () =>
  Effect.gen(function* () {
    const update = yield* send(
      "PATCH",
      "/orgs/acme/projects/web/library/templates/bug-report",
      { name: "Bug" }
    )
    expect(update.status).toBe(200)
    const remove = yield* send("DELETE", "/orgs/acme/library/blocks/acceptance")
    expect(remove.status).toBe(204)
    const hide = yield* send(
      "POST",
      "/orgs/acme/projects/web/library/templates/bug-report/hide"
    )
    expect(hide.status).toBe(204)
    expect(calls).toEqual([
      {
        method: "updateTemplate",
        args: ["acme", USER_ID, "web", "bug-report", { name: "Bug" }]
      },
      { method: "removeBlock", args: ["acme", USER_ID, null, "acceptance"] },
      { method: "hideTemplate", args: ["acme", USER_ID, "web", "bug-report"] }
    ])
  })
)

it.effect("sets the project's default templates", () =>
  Effect.gen(function* () {
    const response = yield* send(
      "PATCH",
      "/orgs/acme/projects/web/library/defaults",
      { defaults: { bug: "bug-report", feat: null } }
    )
    expect(response.status).toBe(200)
    expect(yield* json(response)).toEqual(libraryDefaults)
    expect(calls).toEqual([
      {
        method: "setTemplateDefaults",
        args: [
          "acme",
          USER_ID,
          "web",
          { defaults: { bug: "bug-report", feat: null } }
        ]
      }
    ])
  })
)

it.effect("sets the org's default templates and resets", () =>
  Effect.gen(function* () {
    const response = yield* send("PATCH", "/orgs/acme/library/defaults", {
      defaults: { bug: "bug-report" },
      reset: ["feat"]
    })
    expect(response.status).toBe(200)
    expect(calls).toEqual([
      {
        method: "setOrgTemplateDefaults",
        args: [
          "acme",
          USER_ID,
          { defaults: { bug: "bug-report" }, reset: ["feat"] }
        ]
      }
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
    const forbidden = yield* send(
      "PATCH",
      "/orgs/acme/library/blocks/forbidden",
      {}
    )
    expect(forbidden.status).toBe(403)
    const missing = yield* send(
      "DELETE",
      "/orgs/acme/library/templates/missing"
    )
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
      const blank = yield* send(
        "POST",
        "/orgs/acme/projects/web/library/templates/blank/hide"
      )
      expect(blank.status).toBe(400)
      expect(calls).toEqual([])
    })
)
