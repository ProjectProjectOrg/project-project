import type { AnyRoute } from "@tanstack/react-router"
import * as Registry from "effect/reactivity/AtomRegistry"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { stubFetch } from "@/api/testFetch"
import { Route as OrgRoute } from "@/routes/_authed/orgs/$orgSlug/route"
import { Route as MembersRoute } from "@/routes/_authed/orgs/$orgSlug/settings/members"

const fetchStub = stubFetch()

let registry: Registry.AtomRegistry
let requests: string[]

beforeEach(() => {
  registry = Registry.make()
  requests = []
  const org = new Promise<Response>(() => {})
  fetchStub.set((input: RequestInfo | URL) => {
    const path = new URL(
      input instanceof Request ? input.url : String(input),
      "http://localhost"
    ).pathname
    requests.push(path)
    return path === "/api/orgs/test" ? org : new Promise<Response>(() => {})
  })
})

afterEach(() => {
  registry.dispose()
  vi.restoreAllMocks()
})

const loaderDefaults = (route: AnyRoute) => ({
  route,
  abortController: new AbortController(),
  preload: false,
  deps: {},
  location: {
    href: "/",
    publicHref: "/",
    external: false,
    pathname: "/",
    search: {},
    searchStr: "",
    hash: "",
    state: { __TSR_index: 0 }
  },
  navigate: () => {
    throw new Error("Unexpected imperative navigation")
  },
  parentMatchPromise: new Promise<never>(() => {}),
  cause: "enter" as const
})

function load<A, R>(loader: ((args: A) => R) | object | undefined, args: A) {
  if (typeof loader !== "function") throw new Error("Missing loader")
  return loader(args)
}

it("starts members while the parent org loader is still waiting", async () => {
  const controller = new AbortController()
  const parent = load(OrgRoute.options.loader, {
    ...loaderDefaults(OrgRoute),
    context: { registry },
    params: { orgSlug: "test" },
    abortController: controller
  })
  load(MembersRoute.options.loader, {
    ...loaderDefaults(MembersRoute),
    context: { registry },
    params: { orgSlug: "test" }
  })
  await vi.waitFor(() => expect(requests).toContain("/api/orgs/test/members"))
  expect(requests).toEqual(
    expect.arrayContaining(["/api/orgs/test", "/api/orgs/test/projects"])
  )
  controller.abort()
  await parent
})
