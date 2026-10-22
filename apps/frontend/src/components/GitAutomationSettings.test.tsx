import { RegistryContext } from "@effect/atom-react"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react"
import * as Registry from "effect/unstable/reactivity/AtomRegistry"
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest"

import { stubFetch } from "@/api/testFetch"
import { m } from "@/paraglide/messages"

import { GitAutomationSettings } from "./GitAutomationSettings"

const pickOption = (option: HTMLElement) => {
  fireEvent.pointerDown(option)
  fireEvent.click(option)
}

const fetchStub = stubFetch()
let registry: Registry.AtomRegistry | undefined

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
})
afterAll(() => vi.unstubAllGlobals())
afterEach(() => {
  cleanup()
  registry?.dispose()
})

const statuses = [
  ["todo", "Todo", "a0"],
  ["in_review", "In review", "a1"],
  ["done", "Done", "a2"]
].map(([slug, label, orderKey]) => ({
  slug,
  label,
  icon: "Circle",
  color: "#a3a3a3",
  orderKey,
  createdBy: "user-1",
  createdAt: "2026-01-01T00:00:00.000Z"
}))

const stored = {
  rules: {
    branch_linked: null,
    pr_draft_opened: null,
    pr_opened: null,
    pr_merged: "done",
    pr_closed: null,
    branch_deleted: null
  },
  forwardOnly: false
}

it("saves only the rule that changed", async () => {
  const saved: Array<unknown> = []
  let confirmSave: ((response: Response) => void) | undefined
  fetchStub.set(async (input, init) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      "http://localhost"
    )
    const request = input instanceof Request ? input : null
    const method = init?.method ?? request?.method ?? "GET"
    if (url.pathname.endsWith("/statuses")) return Response.json(statuses)
    if (url.pathname.endsWith("/git-automation") && method === "PATCH") {
      const body: unknown = JSON.parse(
        await (request ?? new Response(init?.body)).text()
      )
      saved.push(body)
      return new Promise<Response>((resolve) => {
        confirmSave = resolve
      })
    }
    if (url.pathname.endsWith("/git-automation")) return Response.json(stored)
    return new Promise<Response>(() => {})
  })
  registry = Registry.make()
  render(
    <RegistryContext.Provider value={registry}>
      <GitAutomationSettings orgSlug="org" slug="project" canEdit />
    </RegistryContext.Provider>
  )

  fireEvent.click(
    await screen.findByRole("combobox", {
      name: m.git_automation_event_pr_opened()
    })
  )
  pickOption(await screen.findByRole("option", { name: "In review" }))

  await waitFor(() =>
    expect(saved).toEqual([{ rules: { pr_opened: "in_review" } }])
  )
  expect(
    screen.getByRole("combobox", { name: m.git_automation_event_pr_opened() })
      .textContent
  ).toContain("In review")
  expect(screen.getByRole("switch").getAttribute("aria-disabled")).toBeNull()
  confirmSave?.(
    Response.json({
      ...stored,
      rules: { ...stored.rules, pr_opened: "in_review" }
    })
  )
})

it("shows the rules read-only to someone who can't manage the workflow", async () => {
  fetchStub.set((input) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      "http://localhost"
    )
    if (url.pathname.endsWith("/statuses"))
      return Promise.resolve(Response.json(statuses))
    if (url.pathname.endsWith("/git-automation"))
      return Promise.resolve(Response.json(stored))
    return new Promise<Response>(() => {})
  })
  registry = Registry.make()
  render(
    <RegistryContext.Provider value={registry}>
      <GitAutomationSettings orgSlug="org" slug="project" canEdit={false} />
    </RegistryContext.Provider>
  )

  const merged = await screen.findByRole("combobox", {
    name: m.git_automation_event_pr_merged()
  })
  expect(merged.textContent).toContain("Done")
  expect(merged.hasAttribute("disabled")).toBe(true)
  expect(screen.getByRole("switch").getAttribute("aria-disabled")).toBe("true")
})
