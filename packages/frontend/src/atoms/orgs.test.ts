import * as Schema from "effect/Schema"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it, vi } from "vitest"
import { OrgInvitation, OrgMember, OrgMembers } from "@projectproject/shared"
import { stubFetch } from "@/api/testFetch"
import {
  inviteMember,
  orgMembers,
  orgRequest,
  transferOwnership,
  updateMemberRole
} from "./orgs"

const owner = {
  userId: "user-owner",
  role: "owner",
  name: "Ada",
  email: "ada@example.com",
  image: null
} satisfies OrgMember

const plain = {
  userId: "user-plain",
  role: "member",
  name: "Bob",
  email: "bob@example.com",
  image: null
} satisfies OrgMember

const coOwner = {
  userId: "user-co-owner",
  role: "owner",
  name: "Cy",
  email: "cy@example.com",
  image: null
} satisfies OrgMember

const encodeMembers = Schema.encodeSync(OrgMembers)
const encodeMember = Schema.encodeSync(OrgMember)
const encodeInvitation = Schema.encodeSync(OrgInvitation)
const req = orgRequest("acme")
const fetchStub = stubFetch()

describe("org members optimistic updates", () => {
  it("shows a pending invitation the moment it is sent", async () => {
    let served: OrgMembers = { members: [owner], invitations: [] }
    let finish = (_response: Response) => {}
    fetchStub.set((_input, init) => {
      if (init?.method === "POST") {
        return new Promise<Response>((resolve) => {
          finish = resolve
        })
      }
      return Promise.resolve(Response.json(encodeMembers(served)))
    })
    const registry = AtomRegistry.make()
    const view = orgMembers(req)
    const mutation = inviteMember(req)
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )

      registry.set(mutation, { email: "carol@example.com", role: "member" })
      const optimistic = registry.get(view)
      if (!AsyncResult.isSuccess(optimistic)) {
        throw new Error("no optimistic value")
      }
      expect(optimistic.waiting).toBe(true)
      expect(optimistic.value.invitations).toMatchObject([
        { email: "carol@example.com", role: "member", status: "pending" }
      ])

      const created = {
        id: "invitation-1",
        email: "carol@example.com",
        role: "member",
        status: "pending"
      } satisfies OrgInvitation
      served = { members: [owner], invitations: [created] }
      finish(Response.json(encodeInvitation(created)))

      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({ waiting: false })
      )
      const settled = registry.get(view)
      if (!AsyncResult.isSuccess(settled)) throw new Error("did not settle")
      expect(settled.value.invitations).toMatchObject([{ id: "invitation-1" }])
    } finally {
      registry.dispose()
    }
  })

  it("demotes only the caller when ownership is transferred", async () => {
    const served: OrgMembers = {
      members: [owner, coOwner, plain],
      invitations: []
    }
    fetchStub.set((_input, init) => {
      if (init?.method === "POST") return new Promise<Response>(() => {})
      return Promise.resolve(Response.json(encodeMembers(served)))
    })
    const registry = AtomRegistry.make()
    const view = orgMembers(req)
    const mutation = transferOwnership({ req, callerUserId: owner.userId })
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )

      registry.set(mutation, { userId: plain.userId })
      const optimistic = registry.get(view)
      if (!AsyncResult.isSuccess(optimistic)) {
        throw new Error("no optimistic value")
      }
      expect(optimistic.value.members).toMatchObject([
        { userId: owner.userId, role: "admin" },
        { userId: coOwner.userId, role: "owner" },
        { userId: plain.userId, role: "owner" }
      ])
    } finally {
      registry.dispose()
    }
  })

  it("shows a member's new role the moment it is chosen", async () => {
    let served: OrgMembers = { members: [owner, plain], invitations: [] }
    let finish = (_response: Response) => {}
    fetchStub.set((_input, init) => {
      if (init?.method === "PATCH") {
        return new Promise<Response>((resolve) => {
          finish = resolve
        })
      }
      return Promise.resolve(Response.json(encodeMembers(served)))
    })
    const registry = AtomRegistry.make()
    const view = orgMembers(req)
    const mutation = updateMemberRole({ req, userId: plain.userId })
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )

      registry.set(mutation, { role: "admin" })
      const optimistic = registry.get(view)
      if (!AsyncResult.isSuccess(optimistic)) {
        throw new Error("no optimistic value")
      }
      expect(optimistic.waiting).toBe(true)
      expect(optimistic.value.members).toMatchObject([
        { userId: owner.userId, role: "owner" },
        { userId: plain.userId, role: "admin" }
      ])

      const promoted = { ...plain, role: "admin" } satisfies OrgMember
      served = { members: [owner, promoted], invitations: [] }
      finish(Response.json(encodeMember(promoted)))

      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({ waiting: false })
      )
      const settled = registry.get(view)
      if (!AsyncResult.isSuccess(settled)) throw new Error("did not settle")
      expect(settled.value.members).toMatchObject([
        { userId: owner.userId, role: "owner" },
        { userId: plain.userId, role: "admin" }
      ])
    } finally {
      registry.dispose()
    }
  })
})
