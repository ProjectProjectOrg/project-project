import { it } from "@effect/vitest"
import { Unauthorized } from "@pp/shared"
import {
  createMemoryHistory,
  createRootRoute,
  createRouter
} from "@tanstack/react-router"
import * as Effect from "effect/Effect"
import * as Result from "effect/reactivity/AsyncResult"
import * as Registry from "effect/reactivity/AtomRegistry"
import { afterAll, afterEach, beforeAll, expect, vi } from "vitest"

import { SNAPSHOT_STORAGE_KEY } from "@/api/querySnapshot"
import { stubFetch } from "@/api/testFetch"
import { me, logout } from "@/features/auth/atoms/auth"
import {
  projectsFor,
  projectsRequest
} from "@/features/projects/atoms/projects"
import { authClient } from "@/services/AuthClient"

import { createSessionCache } from "./sessionCache"

// oxlint-disable-next-line typescript/no-floating-promises -- bun hoists vi.mock above the imports, where it cannot be awaited
vi.mock("@/services/AuthClient", () => ({ authClient: { signOut: vi.fn() } }))

const fetchStub = stubFetch()
const stored = new Map<string, string>()

beforeAll(() => {
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  stored.clear()
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
  settings: {
    avatarSource: null,
    editorPreference: "github",
    chipColors: "flat"
  },
  personalGithub: { connected: false },
  personalEverhour: {
    connected: false,
    everhourUserId: null,
    name: null,
    email: null,
    lastVerifiedAt: null,
    lastCheckError: null
  },
  avatarOptions: []
})

function sessions(viewer: string | null = "alice") {
  return createSessionCache(
    (registry) =>
      createRouter({
        routeTree: createRootRoute(),
        context: { registry },
        history: createMemoryHistory({ initialEntries: ["/"] })
      }),
    "build-1",
    viewer
  )
}

const project = {
  org: "org-a",
  slug: "private",
  key: "PRIV",
  name: "Alice private project",
  icon: "box",
  color: "#94a3b8",
  banner: null,
  iconImage: null,
  createdBy: "alice",
  createdAt: "2026-01-01T00:00:00.000Z"
}

const pendingResponse = () => {
  const settle: Array<(response: Response) => void> = []
  return {
    promise: new Promise<Response>((resolve) => settle.push(resolve)),
    resolve: (response: Response) => settle.forEach((done) => done(response))
  }
}

const urlOf = (input: RequestInfo | URL) =>
  new URL(
    input instanceof Request ? input.url : String(input),
    "http://localhost"
  )

const rememberAlice = Effect.gen(function* () {
  fetchStub.set((input) =>
    Promise.resolve(
      Response.json(
        urlOf(input).pathname.endsWith("/me") ? user("alice") : [project]
      )
    )
  )
  const cache = sessions()
  try {
    yield* Effect.promise(() =>
      vi.waitFor(() => expect(cache.getSnapshot().ready).toBe(true))
    )
    const { registry } = cache.getSnapshot()
    registry.mount(projectsFor(projectsRequest("org-a")))
    yield* Registry.getResult(registry, projectsFor(projectsRequest("org-a")))
    cache.persist()
  } finally {
    cache.dispose()
  }
})

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
              : Response.json(new Unauthorized(), { status: 401 })
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
        expect(stored.has(SNAPSHOT_STORAGE_KEY)).toBe(false)
        expect(cache.getSnapshot().router).not.toBe(alice.router)
        yield* Effect.promise(() =>
          vi.waitFor(() => expect(oldSignal?.aborted).toBe(true))
        )
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
        finishOld(Response.json([project]))
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

it.effect(
  "paints the last confirmed session from disk before /me answers and keeps it for the same user",
  () =>
    Effect.gen(function* () {
      yield* rememberAlice
      const meResponse = pendingResponse()
      fetchStub.set((input) =>
        urlOf(input).pathname.endsWith("/me")
          ? meResponse.promise
          : Promise.resolve(Response.json([project]))
      )
      const cache = sessions()
      try {
        const first = cache.getSnapshot()
        expect(first.ready).toBe(true)
        expect(
          first.registry.get(projectsFor(projectsRequest("org-a")))
        ).toMatchObject({ _tag: "Success", value: [{ slug: "private" }] })
        meResponse.resolve(Response.json(user("alice")))
        yield* Effect.promise(() =>
          vi.waitFor(() =>
            expect(first.registry.get(me())).toMatchObject({
              waiting: false,
              timestamp: expect.any(Number)
            })
          )
        )
        expect(cache.getSnapshot().registry).toBe(first.registry)
        expect(stored.has(SNAPSHOT_STORAGE_KEY)).toBe(true)
      } finally {
        cache.dispose()
      }
    })
)

it.effect(
  "drops a session painted from disk and its snapshot when /me names another user",
  () =>
    Effect.gen(function* () {
      yield* rememberAlice
      fetchStub.set((input) =>
        Promise.resolve(
          Response.json(
            urlOf(input).pathname.endsWith("/me") ? user("bob") : []
          )
        )
      )
      const cache = sessions()
      try {
        const alice = cache.getSnapshot()
        yield* Effect.promise(() =>
          vi.waitFor(() =>
            expect(cache.getSnapshot().registry).not.toBe(alice.registry)
          )
        )
        const bob = cache.getSnapshot()
        expect(bob.registry.get(me())).toMatchObject({ value: { id: "bob" } })
        expect(
          yield* Registry.getResult(
            bob.registry,
            projectsFor(projectsRequest("org-a"))
          )
        ).toEqual([])
        expect(stored.has(SNAPSHOT_STORAGE_KEY)).toBe(false)
      } finally {
        cache.dispose()
      }
    })
)

it.effect(
  "paints nothing from disk and deletes the snapshot when the browser signed in as someone else",
  () =>
    Effect.gen(function* () {
      yield* rememberAlice
      fetchStub.set(() => new Promise<Response>(() => {}))
      const cache = sessions("bob")
      try {
        const first = cache.getSnapshot()
        expect(first.ready).toBe(false)
        expect(
          Result.isInitial(
            first.registry.get(projectsFor(projectsRequest("org-a")))
          )
        ).toBe(true)
        expect(stored.has(SNAPSHOT_STORAGE_KEY)).toBe(false)
      } finally {
        cache.dispose()
      }
    })
)

it.effect(
  "paints nothing from disk and deletes the snapshot when nobody is signed in",
  () =>
    Effect.gen(function* () {
      yield* rememberAlice
      fetchStub.set(() => new Promise<Response>(() => {}))
      const cache = sessions(null)
      try {
        const first = cache.getSnapshot()
        expect(
          Result.isInitial(
            first.registry.get(projectsFor(projectsRequest("org-a")))
          )
        ).toBe(true)
        expect(stored.has(SNAPSHOT_STORAGE_KEY)).toBe(false)
      } finally {
        cache.dispose()
      }
    })
)

it.effect(
  "writes no snapshot after another tab cleared it until /me answers again",
  () =>
    Effect.gen(function* () {
      yield* rememberAlice
      const meResponse = pendingResponse()
      const cache = sessions()
      try {
        fetchStub.set((input) =>
          urlOf(input).pathname.endsWith("/me")
            ? meResponse.promise
            : Promise.resolve(Response.json([project]))
        )
        stored.clear()
        cache.distrust()
        cache.persist()
        expect(stored.has(SNAPSHOT_STORAGE_KEY)).toBe(false)
        meResponse.resolve(Response.json(user("alice")))
        yield* Effect.promise(() =>
          vi.waitFor(() => {
            cache.persist()
            expect(stored.has(SNAPSHOT_STORAGE_KEY)).toBe(true)
          })
        )
      } finally {
        cache.dispose()
      }
    })
)
