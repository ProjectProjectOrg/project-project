import {
  Member,
  NotFound,
  ProjectDetail,
  UpdateProjectSetupInput
} from "@pp/shared"
import * as Cause from "effect/Cause"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it, vi } from "vitest"

import { Api } from "@/api/Api"
import { Keys } from "@/api/keys"
import { stubFetch } from "@/api/testFetch"

import {
  addMember,
  cancelPendingMember,
  forgetProject,
  leaveProject,
  project,
  projectRequest,
  updateMember,
  updateProjectSetup
} from "./projects"

const detail = Schema.decodeSync(ProjectDetail)({
  org: "acme",
  slug: "web",
  key: "WEB",
  name: "Web",
  icon: "W",
  color: "#123456",
  banner: null,
  iconImage: null,
  createdBy: "user-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  github: null,
  setup: {
    workflowReviewedAt: null,
    invitePeopleDismissedAt: null,
    connectGithubDismissedAt: null
  },
  body: "",
  members: [
    {
      id: "user-2",
      username: "jane",
      name: "Jane",
      email: "jane@example.com",
      image: null,
      role: "developer"
    }
  ],
  pendingMembers: [],
  permissions: {}
})

const encode = Schema.encodeSync(ProjectDetail)
const encodeNotFound = Schema.encodeSync(NotFound)
const fetchStub = stubFetch()

describe("project member mutations", () => {
  it("paints a role change immediately", async () => {
    let served = detail
    let finish: ((response: Response) => void) | undefined
    fetchStub.set((_input, init) => {
      if (init?.method === "PATCH") {
        return new Promise<Response>((resolve) => {
          finish = resolve
        })
      }
      return Promise.resolve(Response.json(encode(served)))
    })
    const req = projectRequest("acme", "web")
    const view = project(req)
    const mutation = updateMember({ req, id: "user-2" })
    const registry = AtomRegistry.make()
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(AsyncResult.isSuccess(registry.get(view))).toBe(true)
      )

      registry.set(mutation, { role: "pm" })
      const optimistic = registry.get(view)
      if (!AsyncResult.isSuccess(optimistic)) {
        throw new Error("no optimistic project")
      }
      expect(optimistic.waiting).toBe(true)
      expect(optimistic.value.members[0]?.role).toBe("pm")

      served = {
        ...detail,
        members: [{ ...detail.members[0], role: "pm" }]
      }
      finish?.(Response.json(encode(served)))
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
    } finally {
      registry.dispose()
    }
  })

  it("takes the caller's new grants from a role change before the refetch lands", async () => {
    const managed = {
      ...detail,
      pendingMembers: [
        {
          invitationId: "inv-1",
          email: "new@example.com",
          role: "client" as const,
          expiresAt: DateTime.toDate(
            DateTime.makeUnsafe("2026-04-02T00:00:00.000Z")
          )
        }
      ],
      permissions: { members: ["manage" as const], ticket: ["read" as const] }
    }
    let patched = false
    fetchStub.set((_input, init) => {
      if (init?.method === "PATCH") {
        patched = true
        return Promise.resolve(
          Response.json(
            encode({
              ...detail,
              members: [{ ...detail.members[0], role: "pm" }],
              permissions: { ticket: ["read"] }
            })
          )
        )
      }
      return patched
        ? new Promise<Response>(() => {})
        : Promise.resolve(Response.json(encode(managed)))
    })
    const req = projectRequest("acme", "web")
    const view = project(req)
    const mutation = updateMember({ req, id: "user-2" })
    const registry = AtomRegistry.make()
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(AsyncResult.isSuccess(registry.get(view))).toBe(true)
      )
      registry.set(mutation, { role: "pm" })
      await vi.waitFor(() => {
        const current = registry.get(view)
        if (!AsyncResult.isSuccess(current)) throw new Error("no project")
        expect(current.value.permissions).toStrictEqual({ ticket: ["read"] })
        expect(current.value.pendingMembers).toStrictEqual([])
      })
    } finally {
      registry.dispose()
    }
  })

  it("keeps a later role change when an earlier response arrives first", async () => {
    const secondMember = Schema.decodeSync(Member)({
      ...detail.members[0],
      id: "user-3",
      username: "john",
      name: "John",
      email: "john@example.com"
    })
    const initial = { ...detail, members: [...detail.members, secondMember] }
    const finishes = new Map<string, (response: Response) => void>()
    fetchStub.set((input, init) => {
      if (init?.method === "PATCH") {
        return new Promise<Response>((resolve) => {
          const url = new URL(
            input instanceof Request ? input.url : String(input),
            "http://localhost"
          )
          finishes.set(url.pathname, resolve)
        })
      }
      return Promise.resolve(Response.json(encode(initial)))
    })
    const req = projectRequest("acme", "web")
    const view = project(req)
    const first = updateMember({ req, id: "user-2" })
    const second = updateMember({ req, id: "user-3" })
    const registry = AtomRegistry.make()
    registry.mount(view)
    registry.mount(first)
    registry.mount(second)
    try {
      await vi.waitFor(() =>
        expect(AsyncResult.isSuccess(registry.get(view))).toBe(true)
      )

      registry.set(first, { role: "pm" })
      registry.set(second, { role: "pm" })
      await vi.waitFor(() => expect(finishes.size).toBe(2))

      finishes.get("/api/orgs/acme/projects/web/members/user-2")?.(
        Response.json(
          encode({
            ...initial,
            members: [{ ...detail.members[0], role: "pm" }, secondMember]
          })
        )
      )
      await vi.waitFor(() => expect(registry.get(first).waiting).toBe(false))

      const afterFirst = registry.get(view)
      if (!AsyncResult.isSuccess(afterFirst)) {
        throw new Error("no project after first response")
      }
      expect(afterFirst.value.members.map((member) => member.role)).toEqual([
        "pm",
        "pm"
      ])

      finishes.get("/api/orgs/acme/projects/web/members/user-3")?.(
        Response.json(
          encode({
            ...initial,
            members: [
              { ...detail.members[0], role: "pm" },
              { ...secondMember, role: "pm" }
            ]
          })
        )
      )
      await vi.waitFor(() => expect(registry.get(second).waiting).toBe(false))
    } finally {
      registry.dispose()
    }
  })

  it("invalidates organization invitations after a project invite", async () => {
    const fetched = new Map<string, number>()
    const probe = Api.query("tickets", "count", {
      params: { orgSlug: "acme", slug: "web" },
      query: { q: "orgMembers" },
      timeToLive: "2 minutes",
      reactivityKeys: [Keys.orgMembers("acme")]
    })
    fetchStub.set((_input, init) => {
      if (init?.method === "POST") {
        return Promise.resolve(
          Response.json(
            encode({
              ...detail,
              pendingMembers: [
                {
                  invitationId: "inv-1",
                  email: "new@example.com",
                  role: "developer",
                  expiresAt: DateTime.toDate(
                    DateTime.makeUnsafe("2026-04-02T00:00:00.000Z")
                  )
                }
              ]
            })
          )
        )
      }
      const url = new URL(
        _input instanceof Request ? _input.url : String(_input)
      )
      if (url.pathname.endsWith("/count")) {
        fetched.set("orgMembers", (fetched.get("orgMembers") ?? 0) + 1)
        return Promise.resolve(Response.json({ total: 0, byStatus: {} }))
      }
      return Promise.resolve(Response.json(encode(detail)))
    })
    const req = projectRequest("acme", "web")
    const view = project(req)
    const mutation = addMember({ req, id: "new@example.com" })
    const registry = AtomRegistry.make()
    registry.mount(view)
    registry.mount(mutation)
    registry.mount(probe)
    try {
      await vi.waitFor(() => {
        expect(AsyncResult.isSuccess(registry.get(view))).toBe(true)
        expect(AsyncResult.isSuccess(registry.get(probe))).toBe(true)
      })
      fetched.clear()
      registry.set(mutation, { email: "new@example.com", role: "developer" })
      await vi.waitFor(() => {
        expect(registry.get(mutation).waiting).toBe(false)
        expect(fetched.get("orgMembers") ?? 0).toBeGreaterThan(0)
      })
    } finally {
      registry.dispose()
    }
  })

  it("invalidates organization invitations after canceling a project invite", async () => {
    const pending = {
      ...detail,
      pendingMembers: [
        {
          invitationId: "inv-1",
          email: "new@example.com",
          role: "developer" as const,
          expiresAt: DateTime.toDate(
            DateTime.makeUnsafe("2026-04-02T00:00:00.000Z")
          )
        }
      ]
    }
    const fetched = new Map<string, number>()
    const probe = Api.query("tickets", "count", {
      params: { orgSlug: "acme", slug: "web" },
      query: { q: "orgMembers" },
      timeToLive: "2 minutes",
      reactivityKeys: [Keys.orgMembers("acme")]
    })
    fetchStub.set((_input, init) => {
      if (init?.method === "DELETE") {
        return Promise.resolve(Response.json(encode(detail)))
      }
      const url = new URL(
        _input instanceof Request ? _input.url : String(_input)
      )
      if (url.pathname.endsWith("/count")) {
        fetched.set("orgMembers", (fetched.get("orgMembers") ?? 0) + 1)
        return Promise.resolve(Response.json({ total: 0, byStatus: {} }))
      }
      return Promise.resolve(Response.json(encode(pending)))
    })
    const req = projectRequest("acme", "web")
    const view = project(req)
    const mutation = cancelPendingMember({ req, id: "inv-1" })
    const registry = AtomRegistry.make()
    registry.mount(view)
    registry.mount(mutation)
    registry.mount(probe)
    try {
      await vi.waitFor(() => {
        expect(AsyncResult.isSuccess(registry.get(view))).toBe(true)
        expect(AsyncResult.isSuccess(registry.get(probe))).toBe(true)
      })
      fetched.clear()
      registry.set(mutation, undefined)
      await vi.waitFor(() => {
        expect(registry.get(mutation).waiting).toBe(false)
        expect(fetched.get("orgMembers") ?? 0).toBeGreaterThan(0)
      })
    } finally {
      registry.dispose()
    }
  })
})

describe("leaving a project", () => {
  it("refreshes the project list without refetching the project", async () => {
    const fetched = new Map<string, number>()
    const count = (key: string) => fetched.set(key, (fetched.get(key) ?? 0) + 1)
    const probe = Api.query("tickets", "count", {
      params: { orgSlug: "acme", slug: "web" },
      query: { q: "projects" },
      timeToLive: "2 minutes",
      reactivityKeys: [Keys.projects("acme")]
    })
    fetchStub.set((input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (init?.method === "POST" && url.pathname.endsWith("/leave")) {
        count("leave")
        return Promise.resolve(new Response(null, { status: 204 }))
      }
      if (url.pathname.endsWith("/count")) {
        count("projects")
        return Promise.resolve(Response.json({ total: 0, byStatus: {} }))
      }
      count("detail")
      return Promise.resolve(Response.json(encode(detail)))
    })
    const req = projectRequest("acme", "web")
    const view = project(req)
    const mutation = leaveProject(req)
    const registry = AtomRegistry.make()
    registry.mount(view)
    registry.mount(mutation)
    registry.mount(probe)
    try {
      await vi.waitFor(() => {
        expect(AsyncResult.isSuccess(registry.get(view))).toBe(true)
        expect(AsyncResult.isSuccess(registry.get(probe))).toBe(true)
      })
      fetched.clear()
      registry.set(mutation, undefined)
      await vi.waitFor(() => {
        expect(AsyncResult.isSuccess(registry.get(mutation))).toBe(true)
        expect(fetched.get("projects") ?? 0).toBeGreaterThan(0)
      })
      expect(fetched.get("leave")).toBe(1)
      expect(fetched.get("detail")).toBeUndefined()
    } finally {
      registry.dispose()
    }
  })
})

describe("forgetting a left project", () => {
  it("ends in not found when the left project is opened again", async () => {
    let left = false
    fetchStub.set(() =>
      Promise.resolve(
        left
          ? Response.json(encodeNotFound(new NotFound()), { status: 404 })
          : Response.json(encode(detail))
      )
    )
    const req = projectRequest("acme", "web")
    const view = project(req)
    const forget = forgetProject(req)
    const registry = AtomRegistry.make()
    const unmountView = registry.mount(view)
    registry.mount(forget)
    try {
      await vi.waitFor(() =>
        expect(AsyncResult.isSuccess(registry.get(view))).toBe(true)
      )
      left = true
      unmountView()
      registry.set(forget, undefined)
      registry.mount(view)
      await vi.waitFor(() => {
        const current = registry.get(view)
        expect(
          AsyncResult.isFailure(current)
            ? Cause.findErrorOption(current.cause)
            : Option.none()
        ).toStrictEqual(Option.some(new NotFound()))
      })
    } finally {
      registry.dispose()
    }
  })
})

describe("project setup mutations", () => {
  it("carries a pending setup field into a superseding update", async () => {
    const payloads: Array<unknown> = []
    const inviteAt = DateTime.toDate(
      DateTime.makeUnsafe("2026-04-01T00:00:00.000Z")
    )
    const githubAt = DateTime.toDate(
      DateTime.makeUnsafe("2026-04-01T00:00:01.000Z")
    )
    const confirmed = {
      ...detail,
      setup: {
        ...detail.setup,
        invitePeopleDismissedAt: inviteAt,
        connectGithubDismissedAt: githubAt
      }
    }
    let served = detail
    fetchStub.set(async (input, init) => {
      if (init?.method === "PATCH") {
        const request =
          input instanceof Request ? input : new Request(input, init)
        const payload = Schema.decodeUnknownSync(UpdateProjectSetupInput)(
          await request.json()
        )
        payloads.push(payload)
        if (payload.connectGithubDismissedAt !== undefined) {
          served = confirmed
          return Response.json(encode(confirmed))
        }
        return new Promise<Response>(() => {})
      }
      return Promise.resolve(Response.json(encode(served)))
    })
    const req = projectRequest("acme", "web")
    const view = project(req)
    const mutation = updateProjectSetup(req)
    const registry = AtomRegistry.make()
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(AsyncResult.isSuccess(registry.get(view))).toBe(true)
      )

      registry.set(mutation, {
        invitePeopleDismissedAt: inviteAt
      })
      registry.set(mutation, {
        connectGithubDismissedAt: githubAt
      })
      expect(registry.get(view)).toMatchObject({
        value: {
          setup: {
            invitePeopleDismissedAt: inviteAt,
            connectGithubDismissedAt: githubAt
          }
        }
      })
      await vi.waitFor(() =>
        expect(payloads).toContainEqual({
          invitePeopleDismissedAt: inviteAt,
          connectGithubDismissedAt: githubAt
        })
      )
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
      expect(registry.get(view)).toMatchObject({
        value: {
          setup: {
            invitePeopleDismissedAt: inviteAt,
            connectGithubDismissedAt: githubAt
          }
        }
      })
    } finally {
      registry.dispose()
    }
  })
})
