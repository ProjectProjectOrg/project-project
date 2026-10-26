import {
  Conflict,
  StatusSlug,
  UpdateGitAutomationInput,
  type GitAutomation
} from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import * as Schema from "effect/Schema"
import { expect, it, vi } from "vitest"

import { stubFetch } from "@/api/testFetch"

import {
  gitAutomationFor,
  gitAutomationRequest,
  updateGitAutomation
} from "./gitAutomation"

const fetchStub = stubFetch()
const decode = Schema.decodeUnknownSync(UpdateGitAutomationInput)
const review = StatusSlug.make("in_review")
const done = StatusSlug.make("done")
const initial: GitAutomation = {
  rules: {
    branch_linked: null,
    pr_draft_opened: null,
    pr_opened: null,
    pr_merged: null,
    pr_closed: null,
    branch_deleted: null
  },
  forwardOnly: true
}

const setup = async () => {
  let served = initial
  const requests: Array<
    Readonly<{
      payload: UpdateGitAutomationInput
      signal: AbortSignal
      succeed: () => void
      fail: () => void
    }>
  > = []
  fetchStub.set(async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init)
    if (request.method !== "PATCH") return Response.json(served)
    const payload = decode(await request.json())
    return new Promise<Response>((resolve) => {
      requests.push({
        payload,
        signal: request.signal,
        succeed: () => {
          served = {
            rules: { ...served.rules, ...payload.rules },
            forwardOnly: payload.forwardOnly ?? served.forwardOnly
          }
          resolve(Response.json(served))
        },
        fail: () =>
          resolve(
            Response.json(new Conflict({ reason: "status_not_found" }), {
              status: 409
            })
          )
      })
    })
  })
  const req = gitAutomationRequest("acme", "web")
  const view = gitAutomationFor(req)
  const mutation = updateGitAutomation(req)
  const registry = AtomRegistry.make()
  const unmountView = registry.mount(view)
  const unmountMutation = registry.mount(mutation)
  await vi.waitFor(() =>
    expect(AsyncResult.isSuccess(registry.get(view))).toBe(true)
  )
  return {
    registry,
    view,
    mutation,
    requests,
    saved: () => served,
    unmountView,
    unmountMutation
  }
}

it.each([
  {
    name: "different rules",
    next: { rules: { pr_merged: done } },
    expected: { rules: { pr_opened: review, pr_merged: done } }
  },
  {
    name: "the same rule",
    next: { rules: { pr_opened: done } },
    expected: { rules: { pr_opened: done } }
  },
  {
    name: "a rule and the toggle",
    next: { forwardOnly: false },
    expected: { rules: { pr_opened: review }, forwardOnly: false }
  },
  {
    name: "clearing a rule",
    next: { rules: { pr_opened: null } },
    expected: { rules: { pr_opened: null } }
  }
] satisfies ReadonlyArray<
  Readonly<{ name: string; next: UpdateGitAutomationInput; expected: unknown }>
>)(
  "serializes edits to $name without reverting the latest prediction",
  async ({ next, expected }) => {
    const { registry, view, mutation, requests, saved } = await setup()
    try {
      registry.set(mutation, { rules: { pr_opened: review } })
      await vi.waitFor(() => expect(requests).toHaveLength(1))
      registry.set(mutation, next)
      await new Promise<void>((resolve) =>
        registry.schedulerAsync.makeDispatcher().scheduleTask(resolve, 0)
      )
      expect(registry.get(view)).toMatchObject({
        value: expected,
        waiting: true
      })
      expect(requests[0].signal.aborted).toBe(false)
      expect(requests).toHaveLength(1)
      requests[0].succeed()
      await vi.waitFor(() => expect(requests).toHaveLength(2))
      expect(registry.get(view)).toMatchObject({
        value: expected,
        waiting: true
      })
      requests[1].succeed()
      await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
      expect(saved()).toMatchObject(expected)
      expect(registry.get(view)).toMatchObject({ value: expected })
    } finally {
      registry.dispose()
    }
  }
)

it("coalesces waiting edits into one request", async () => {
  const { registry, mutation, requests, saved } = await setup()
  try {
    registry.set(mutation, { forwardOnly: false })
    await vi.waitFor(() => expect(requests).toHaveLength(1))
    registry.set(mutation, { rules: { pr_opened: review } })
    registry.set(mutation, { rules: { pr_merged: done } })
    requests[0].succeed()
    await vi.waitFor(() => expect(requests).toHaveLength(2))
    expect(requests[1].payload).toEqual({
      rules: { pr_opened: review, pr_merged: done }
    })
    requests[1].succeed()
    await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
    expect(requests).toHaveLength(2)
    expect(saved()).toMatchObject({
      rules: { pr_opened: review, pr_merged: done },
      forwardOnly: false
    })
  } finally {
    registry.dispose()
  }
})

it("restores the successful write if the queued write fails and clears failed edits", async () => {
  const { registry, view, mutation, requests } = await setup()
  try {
    registry.set(mutation, { rules: { pr_opened: review } })
    await vi.waitFor(() => expect(requests).toHaveLength(1))
    registry.set(mutation, { rules: { pr_merged: done } })
    requests[0].succeed()
    await vi.waitFor(() => expect(requests).toHaveLength(2))
    requests[1].fail()
    await vi.waitFor(() =>
      expect(AsyncResult.isFailure(registry.get(mutation))).toBe(true)
    )
    await vi.waitFor(() =>
      expect(registry.get(view)).toMatchObject({
        value: { rules: { pr_opened: review, pr_merged: null } }
      })
    )
    registry.set(mutation, { forwardOnly: false })
    await vi.waitFor(() => expect(requests).toHaveLength(3))
    expect(requests[2].payload).toEqual({ forwardOnly: false })
    requests[2].succeed()
    await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
  } finally {
    registry.dispose()
  }
})

it("does not resend rejected fields with a later edit", async () => {
  const { registry, view, mutation, requests, saved } = await setup()
  try {
    registry.set(mutation, { rules: { pr_opened: review } })
    await vi.waitFor(() => expect(requests).toHaveLength(1))
    registry.set(mutation, { rules: { pr_merged: done } })
    requests[0].fail()
    await vi.waitFor(() => expect(requests).toHaveLength(2))
    expect(requests[1].payload).toEqual({
      rules: { pr_merged: done }
    })
    expect(registry.get(view)).toMatchObject({
      waiting: true,
      value: { rules: { pr_opened: review, pr_merged: done } }
    })
    requests[1].succeed()
    await vi.waitFor(() => expect(registry.get(mutation).waiting).toBe(false))
    expect(saved().rules).toMatchObject({ pr_opened: null, pr_merged: done })
  } finally {
    registry.dispose()
  }
})

it.each(["view", "editor"])(
  "finishes queued saves after leaving the %s",
  async (surface) => {
    const {
      registry,
      view,
      mutation,
      requests,
      saved,
      unmountView,
      unmountMutation
    } = await setup()
    try {
      registry.set(mutation, { rules: { pr_opened: review } })
      await vi.waitFor(() => expect(requests).toHaveLength(1))
      registry.set(mutation, { rules: { pr_merged: done } })
      if (surface === "view") unmountView()
      unmountMutation()
      await new Promise<void>((resolve) =>
        registry.schedulerAsync.makeDispatcher().scheduleTask(resolve, 0)
      )
      requests[0].succeed()
      await vi.waitFor(() => expect(requests).toHaveLength(2))
      requests[1].succeed()
      await vi.waitFor(() =>
        expect(saved().rules).toMatchObject({
          pr_opened: review,
          pr_merged: done
        })
      )
      registry.mount(view)
      await vi.waitFor(() =>
        expect(registry.get(view)).toMatchObject({
          waiting: false,
          value: { rules: { pr_opened: review, pr_merged: done } }
        })
      )
    } finally {
      registry.dispose()
    }
  }
)
