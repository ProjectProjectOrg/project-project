import { Org, Slug, UserInvitation } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Schema from "effect/Schema"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it, vi } from "vitest"

import { stubFetch } from "@/api/testFetch"

import { acceptInvitation, invitations } from "./invitations"

const orgSlug = Schema.decodeSync(Slug)("acme")

const pending = {
  id: "invitation-1",
  orgSlug,
  orgName: "Acme",
  role: "member",
  inviterEmail: "ada@example.com",
  expiresAt: DateTime.toDate(DateTime.makeUnsafe("2026-12-01T00:00:00.000Z")),
  createdAt: DateTime.toDate(DateTime.makeUnsafe("2026-09-01T00:00:00.000Z"))
} satisfies UserInvitation

const encodeInvitations = Schema.encodeSync(Schema.Array(UserInvitation))
const encodeOrg = Schema.encodeSync(Org)
const fetchStub = stubFetch()

describe("invitations optimistic updates", () => {
  it("drops an accepted invitation from the list immediately", async () => {
    let served: ReadonlyArray<UserInvitation> = [pending]
    let finish = (_response: Response) => {}
    fetchStub.set((_input, init) => {
      if (init?.method === "POST") {
        return new Promise<Response>((resolve) => {
          finish = resolve
        })
      }
      return Promise.resolve(Response.json(encodeInvitations(served)))
    })
    const registry = AtomRegistry.make()
    const view = invitations()
    const mutation = acceptInvitation({ invitationId: pending.id })
    registry.mount(view)
    registry.mount(mutation)
    try {
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          _tag: "Success",
          waiting: false
        })
      )

      registry.set(mutation, undefined)
      const optimistic = registry.get(view)
      if (!AsyncResult.isSuccess(optimistic)) {
        throw new Error("no optimistic value")
      }
      expect(optimistic.waiting).toBe(true)
      expect(optimistic.value).toEqual([])

      served = []
      finish(
        Response.json(
          encodeOrg({ slug: orgSlug, name: "Acme", role: "member" })
        )
      )

      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({ waiting: false })
      )
      const settled = registry.get(view)
      if (!AsyncResult.isSuccess(settled)) throw new Error("did not settle")
      expect(settled.value).toEqual([])
    } finally {
      registry.dispose()
    }
  })
})
