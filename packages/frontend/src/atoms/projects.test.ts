import * as Schema from "effect/Schema"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { describe, expect, it, vi } from "vitest"
import { ProjectDetail } from "@projectproject/shared"
import { stubFetch } from "@/api/testFetch"
import { project, projectRequest, updateMember } from "./projects"

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
})
