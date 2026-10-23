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

function load<A, R>(
  loader: ((args: A) => R) | object | undefined,
  args: Partial<A>
) {
  if (typeof loader !== "function") throw new Error("Missing loader")
  return loader(args as A)
}

it("starts members while the parent org loader is still waiting", async () => {
  const controller = new AbortController()
  const parent = load(OrgRoute.options.loader, {
    context: { registry },
    params: { orgSlug: "test" },
    abortController: controller
  })
  load(MembersRoute.options.loader, {
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
