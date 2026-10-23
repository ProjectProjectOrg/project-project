import { it } from "@effect/vitest"
import {
  createMemoryHistory,
  createRootRoute,
  createRouter
} from "@tanstack/react-router"
import * as Effect from "effect/Effect"
import * as Registry from "effect/reactivity/AtomRegistry"
import { afterAll, afterEach, expect, vi } from "vitest"

import { stubFetch } from "@/api/testFetch"
import { me, logout } from "@/features/auth/atoms/auth"
import {
  projectsFor,
  projectsRequest
} from "@/features/projects/atoms/projects"
import { authClient } from "@/services/AuthClient"

import { createSessionCache } from "./sessionCache"

vi.mock("@/services/AuthClient", () => ({ authClient: { signOut: vi.fn() } }))

const fetchStub = stubFetch()

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(() => vi.unstubAllGlobals())

const user = (id: string, activeOrgSlug = "org-a") => ({
  id,
  name: id,
  email: id + "@example.com",
  username: id,
  image: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  activeOrgSlug,
  editorPreference: "github",
  personalGithub: { connected: false },
  personalEverhour: {
    connected: false,
    everhourUserId: null,
    name: null,
    email: null,
    lastVerifiedAt: null,
    lastCheckError: null
  }
})

function sessions() {
  return createSessionCache((registry) =>
    createRouter({
      routeTree: createRootRoute(),
      context: { registry },
      history: createMemoryHistory({ initialEntries: ["/"] })
    })
  )
}

it.effect(
  "drops both caches on logout and cannot reuse an old user's late response after sign-in",
  () =>
    Effect.gen(function* () {
      let identity: string | null = "alice"
      let finishOld: (response: Response) => void = vi.fn()
      let oldSignal: AbortSignal | null | undefined
      fetchStub.set((input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input),
          "http://localhost"
        )
        if (url.pathname.endsWith("/me"))
          return Promise.resolve(
            identity
              ? Response.json(user(identity))
              : Response.json({ _tag: "Unauthorized" }, { status: 401 })
          )
        if (identity === "alice")
          return new Promise<Response>((resolve) => {
            finishOld = resolve
            oldSignal =
              init?.signal ?? (input instanceof Request ? input.signal : null)
          })
        return Promise.resolve(Response.json([]))
      })
      vi.mocked(authClient.signOut).mockImplementation(async () => {
        identity = null
        return { data: { success: true }, error: null }
      })
      const cache = sessions()
      try {
        yield* Effect.promise(() =>
          vi.waitFor(() => expect(cache.getSnapshot().ready).toBe(true))
        )
        const alice = cache.getSnapshot()
        alice.registry.mount(projectsFor(projectsRequest("org-a")))
        yield* Effect.promise(() =>
          vi.waitFor(() => expect(oldSignal).toBeTruthy())
        )
        alice.registry.set(logout, undefined)
        yield* Effect.promise(() =>
          vi.waitFor(() =>
            expect(cache.getSnapshot().registry).not.toBe(alice.registry)
          )
        )
        expect(cache.getSnapshot().router).not.toBe(alice.router)
        expect(oldSignal?.aborted).toBe(true)
        identity = "bob"
        cache.refreshIdentity()
        yield* Effect.promise(() =>
          vi.waitFor(() =>
            expect(cache.getSnapshot().registry.get(me())).toMatchObject({
              value: { id: "bob" }
            })
          )
        )
        const bob = cache.getSnapshot()
        expect(bob.registry).not.toBe(alice.registry)
        finishOld(
          Response.json([
            {
              org: "org-a",
              slug: "private",
              key: "PRIV",
              name: "Alice private project",
              icon: "box",
              color: "#94a3b8",
              createdBy: "alice",
              createdAt: "2026-01-01T00:00:00.000Z"
            }
          ])
        )
        expect(
          yield* Registry.getResult(
            bob.registry,
            projectsFor(projectsRequest("org-a"))
          )
        ).toEqual([])
      } finally {
        cache.dispose()
      }
    })
)

it.effect(
  "retains org-keyed caches on org switching, but replaces them for a direct identity change",
  () =>
    Effect.gen(function* () {
      let current = user("alice")
      const fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input),
          "http://localhost"
        )
        return Response.json(url.pathname.endsWith("/me") ? current : [])
      })
      fetchStub.set(fetch)
      const cache = sessions()
      try {
        yield* Effect.promise(() =>
          vi.waitFor(() => expect(cache.getSnapshot().ready).toBe(true))
        )
        const first = cache.getSnapshot()
        yield* Registry.getResult(
          first.registry,
          projectsFor(projectsRequest("org-a"))
        )
        current = user("alice", "org-b")
        cache.refreshIdentity()
        yield* Effect.promise(() =>
          vi.waitFor(() =>
            expect(first.registry.get(me())).toMatchObject({
              value: { activeOrgSlug: "org-b" }
            })
          )
        )
        expect(cache.getSnapshot().registry).toBe(first.registry)
        expect(cache.getSnapshot().router).toBe(first.router)
        const count = fetch.mock.calls.length
        yield* Registry.getResult(
          first.registry,
          projectsFor(projectsRequest("org-a"))
        )
        expect(fetch.mock.calls.length).toBe(count)
        current = user("bob", "org-b")
        cache.refreshIdentity()
        yield* Effect.promise(() =>
          vi.waitFor(() =>
            expect(cache.getSnapshot().registry).not.toBe(first.registry)
          )
        )
        expect(cache.getSnapshot().registry.get(me())).toMatchObject({
          value: { id: "bob" }
        })
      } finally {
        cache.dispose()
      }
    })
)
