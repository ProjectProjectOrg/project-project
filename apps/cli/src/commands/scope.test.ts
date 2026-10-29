import * as BunServices from "@effect/platform-bun/BunServices"
import { describe, expect, it } from "@effect/vitest"
import { Command } from "effect/cli"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"

import { Browser } from "../auth/Browser"
import { Loopback } from "../auth/Loopback"
import { notSignedIn } from "../CliFailure"
import {
  type SavedScope,
  type SavedServer,
  ServerStore
} from "../servers/ServerStore"
import { fakeHttp, jsonBody } from "../testing"
import { pp } from "./tree"

const origin = "https://pp.example.com"

const meUser = {
  id: "u-1",
  email: "ada@example.com",
  name: "Ada",
  username: null,
  image: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  personalGithub: { connected: false },
  personalEverhour: {
    connected: false,
    everhourUserId: null,
    name: null,
    email: null,
    lastVerifiedAt: null,
    lastCheckError: null
  }
}

const titleOf = (slug: string) => `${slug[0]?.toUpperCase()}${slug.slice(1)}`

const project = (org: string, slug: string) => ({
  banner: null,
  iconImage: null,
  org,
  slug,
  key: slug.slice(0, 3).toUpperCase(),
  name: titleOf(slug),
  icon: "box",
  color: "#94a3b8",
  createdBy: "u-1",
  createdAt: "2026-01-01T00:00:00.000Z"
})

const onePerPage = <A>(input: unknown, items: ReadonlyArray<A>) => {
  const start =
    Predicate.hasProperty(input, "cursor") && Predicate.isString(input.cursor)
      ? Number(input.cursor)
      : 0
  return {
    items: items.slice(start, start + 1),
    nextCursor: start + 1 < items.length ? String(start + 1) : null
  }
}

type World = Readonly<{
  orgs: ReadonlyArray<string>
  projects: Readonly<Record<string, ReadonlyArray<string>>>
  scope?: SavedScope
  env?: Readonly<Record<string, string>>
  ticketsStatus?: number
}>

const run = (world: World, args: ReadonlyArray<string>) => {
  const calls: Array<Readonly<{ tool: string; input: unknown }>> = []
  const saved: Array<Option.Option<SavedScope>> = []
  const signedIn: SavedServer = {
    origin,
    user: { id: "u-1", name: "Ada", email: "ada@example.com" },
    endpoints: { token: `${origin}/api/auth/oauth2/token` },
    tokens: {
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: Number.MAX_SAFE_INTEGER
    }
  }
  const server: SavedServer =
    world.scope === undefined ? signedIn : { ...signedIn, scope: world.scope }
  const store = Layer.succeed(
    ServerStore,
    ServerStore.of({
      file: "servers.json",
      list: Effect.succeed({
        version: 1,
        defaultServer: origin,
        servers: [server]
      }),
      save: () => Effect.void,
      remove: () => Effect.succeed(true),
      setDefault: () => Effect.void,
      setScope: (_origin, scope) => Effect.sync(() => void saved.push(scope)),
      select: (preferred) =>
        Option.getOrElse(preferred, () => origin) === origin
          ? Effect.succeed(server)
          : Effect.fail(notSignedIn("not signed in"))
    })
  )
  const http = fakeHttp((url, request) => {
    const tool = url.pathname.split("/").at(-1) ?? ""
    const input = jsonBody(request)
    calls.push({ tool, input })
    switch (tool) {
      case "me":
        return Response.json({
          user: meUser,
          roles: world.orgs.map((orgSlug) => ({ orgSlug, role: "member" }))
        })
      case "list_orgs":
        return Response.json(
          onePerPage(
            input,
            world.orgs.map((slug) => ({
              slug,
              name: titleOf(slug),
              role: "member"
            }))
          )
        )
      case "list_projects": {
        const org =
          Predicate.hasProperty(input, "orgSlug") &&
          Predicate.isString(input.orgSlug)
            ? input.orgSlug
            : ""
        return Response.json(
          onePerPage(
            input,
            (world.projects[org] ?? []).map((slug) => project(org, slug))
          )
        )
      }
      default:
        return world.ticketsStatus === undefined
          ? Response.json({ items: [], nextCursor: null })
          : Response.json(
              { _tag: "ToolFailure", error: "NotFound", message: "Not found." },
              { status: world.ticketsStatus }
            )
    }
  })
  const effect = Command.runWith(pp, { version: "test" })(args).pipe(
    Effect.provide(
      Layer.mergeAll(
        store,
        http,
        Browser.layer,
        Loopback.layer,
        ConfigProvider.layer(ConfigProvider.fromUnknown(world.env ?? {}))
      ).pipe(Layer.provideMerge(BunServices.layer))
    )
  )
  const toolInput = (tool: string) =>
    calls.find((call) => call.tool === tool)?.input
  return { effect, calls, saved, toolInput }
}

describe("choosing the org and project", () => {
  it.effect("uses your only org and its only project without flags", () => {
    const world = run({ orgs: ["acme"], projects: { acme: ["website"] } }, [
      "tickets",
      "list"
    ])
    return Effect.gen(function* () {
      yield* world.effect
      expect(world.toolInput("list_tickets")).toMatchObject({
        orgSlug: "acme",
        projectSlug: "website"
      })
    })
  })

  it.effect("uses the saved default without asking the server", () => {
    const world = run(
      {
        orgs: ["acme", "beta"],
        projects: { beta: ["app", "site"] },
        scope: { org: "beta", project: "app" }
      },
      ["tickets", "list"]
    )
    return Effect.gen(function* () {
      yield* world.effect
      expect(world.calls.map((call) => call.tool)).toEqual(["list_tickets"])
      expect(world.toolInput("list_tickets")).toMatchObject({
        orgSlug: "beta",
        projectSlug: "app"
      })
    })
  })

  it.effect(
    "lets PP_ORG override the default, without borrowing its project",
    () => {
      const world = run(
        {
          orgs: ["acme", "beta"],
          projects: { acme: ["website"], beta: ["app"] },
          scope: { org: "beta", project: "app" },
          env: { PP_ORG: "acme" }
        },
        ["tickets", "list"]
      )
      return Effect.gen(function* () {
        yield* world.effect
        expect(world.toolInput("list_tickets")).toMatchObject({
          orgSlug: "acme",
          projectSlug: "website"
        })
      })
    }
  )

  it.effect("lets flags override the environment", () => {
    const world = run(
      {
        orgs: ["acme", "beta"],
        projects: {},
        env: { PP_ORG: "acme", PP_PROJECT: "website" }
      },
      ["tickets", "list", "--org", "beta", "--project", "app"]
    )
    return Effect.gen(function* () {
      yield* world.effect
      expect(world.toolInput("list_tickets")).toMatchObject({
        orgSlug: "beta",
        projectSlug: "app"
      })
    })
  })

  it.effect("fills pp call input, keeping slugs the JSON already has", () => {
    const world = run({ orgs: ["acme"], projects: { acme: ["website"] } }, [
      "call",
      "get_ticket",
      '{"id":"T-1","projectSlug":"app"}'
    ])
    return Effect.gen(function* () {
      yield* world.effect
      expect(world.toolInput("get_ticket")).toEqual({
        orgSlug: "acme",
        projectSlug: "app",
        id: "T-1"
      })
    })
  })

  it.effect("lists your orgs when it can't decide", () => {
    const world = run({ orgs: ["acme", "beta"], projects: {} }, [
      "tickets",
      "list"
    ])
    return Effect.gen(function* () {
      const failure = yield* Effect.flip(world.effect)
      expect(failure).toMatchObject({ _tag: "CliFailure", code: 2 })
      expect(failure.message).toContain(
        "Yours:\n\n  Acme   acme\n  Beta   beta"
      )
      expect(world.toolInput("list_tickets")).toBeUndefined()
    })
  })

  it.effect("lists the org's projects when it can't decide", () => {
    const world = run(
      { orgs: ["acme"], projects: { acme: ["website", "app"] } },
      ["tickets", "list"]
    )
    return Effect.gen(function* () {
      const failure = yield* Effect.flip(world.effect)
      expect(failure.message).toContain(
        "Its projects:\n\n  Website   WEB   website\n  App       APP   app"
      )
      expect(failure.message).toContain("pp use acme/<slug>")
    })
  })

  it.effect("points at the saved default when the server can't find it", () => {
    const world = run(
      {
        orgs: ["acme"],
        projects: {},
        scope: { org: "gone", project: "old" },
        ticketsStatus: 422
      },
      ["tickets", "list"]
    )
    return Effect.gen(function* () {
      const failure = yield* Effect.flip(world.effect)
      expect(failure).toMatchObject({ code: 5 })
      expect(failure.message).toContain("This used your default gone/old.")
    })
  })
})

describe("pp use", () => {
  it.effect("saves an org and project you can see", () => {
    const world = run({ orgs: ["acme"], projects: { acme: ["website"] } }, [
      "use",
      "acme/website"
    ])
    return Effect.gen(function* () {
      yield* world.effect
      expect(world.saved).toEqual([
        Option.some({ org: "acme", project: "website" })
      ])
    })
  })

  it.effect("refuses an org you don't belong to", () => {
    const world = run({ orgs: ["acme"], projects: {} }, ["use", "beta"])
    return Effect.gen(function* () {
      const failure = yield* Effect.flip(world.effect)
      expect(failure.message).toContain("  Acme   acme")
      expect(world.saved).toEqual([])
    })
  })

  it.effect("clears the default", () => {
    const world = run({ orgs: [], projects: {} }, ["use", "--clear"])
    return Effect.gen(function* () {
      yield* world.effect
      expect(world.saved).toEqual([Option.none()])
    })
  })

  it.effect("asks for an argument when it can't show a list", () => {
    const world = run({ orgs: ["acme", "beta"], projects: {} }, ["use"])
    return Effect.gen(function* () {
      const failure = yield* Effect.flip(world.effect)
      expect(failure).toMatchObject({ code: 2 })
    })
  })
})
