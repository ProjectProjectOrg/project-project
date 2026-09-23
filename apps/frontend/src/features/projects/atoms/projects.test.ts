import { Member, ProjectDetail, UpdateProjectSetupInput } from "@pp/shared"
import * as DateTime from "effect/DateTime"
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
      role: "member"
    }
  ],
  pendingMembers: []
})

const encode = Schema.encodeSync(ProjectDetail)
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

      registry.set(mutation, { role: "admin" })
      const optimistic = registry.get(view)
      if (!AsyncResult.isSuccess(optimistic)) {
        throw new Error("no optimistic project")
      }
      expect(optimistic.waiting).toBe(true)
      expect(optimistic.value.members[0]?.role).toBe("admin")

      served = {
        ...detail,
        members: [{ ...detail.members[0], role: "admin" }]
      }
      finish?.(Response.json(encode(served)))
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
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

      registry.set(first, { role: "admin" })
      registry.set(second, { role: "admin" })
      await vi.waitFor(() => expect(finishes.size).toBe(2))

      finishes.get("/api/orgs/acme/projects/web/members/user-2")?.(
        Response.json(
          encode({
            ...initial,
            members: [{ ...detail.members[0], role: "admin" }, secondMember]
          })
        )
      )
      await vi.waitFor(() => expect(registry.get(first).waiting).toBe(false))

      const afterFirst = registry.get(view)
      if (!AsyncResult.isSuccess(afterFirst)) {
        throw new Error("no project after first response")
      }
      expect(afterFirst.value.members.map((member) => member.role)).toEqual([
        "admin",
        "admin"
      ])

      finishes.get("/api/orgs/acme/projects/web/members/user-3")?.(
        Response.json(
          encode({
            ...initial,
            members: [
              { ...detail.members[0], role: "admin" },
              { ...secondMember, role: "admin" }
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
                  role: "member",
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
      registry.set(mutation, { email: "new@example.com", role: "member" })
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
          role: "member" as const,
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
