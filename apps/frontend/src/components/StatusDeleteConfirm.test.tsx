import { RegistryContext } from "@effect/atom-react"
import { ProjectStatus } from "@pp/shared"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react"
import * as Schema from "effect/Schema"
import * as Registry from "effect/unstable/reactivity/AtomRegistry"
import { afterEach, expect, it, vi } from "vitest"

import { stubFetch } from "@/api/testFetch"
import { m } from "@/paraglide/messages"

import { StatusDeleteConfirm } from "./StatusDeleteConfirm"

vi.mock("@/lib/access", () => ({
  useProjectActor: () => ({ call: () => true })
}))
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: vi.fn() }),
  Link: ({ children }: Readonly<{ children?: React.ReactNode }>) => (
    <a>{children}</a>
  )
}))

const fetchStub = stubFetch()
let registry: Registry.AtomRegistry | undefined

afterEach(() => {
  cleanup()
  registry?.dispose()
})

it("blocks deletion until automation is available, including after a failed read and retry", async () => {
  let reads = 0
  let respond: ((response: Response) => void) | undefined
  fetchStub.set((input) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      "http://localhost"
    )
    if (url.pathname.endsWith("/git-automation")) {
      reads += 1
      return new Promise<Response>((resolve) => {
        respond = resolve
      })
    }
    return Promise.resolve(Response.json({ byStatus: {}, total: 0 }))
  })
  const status = Schema.decodeUnknownSync(ProjectStatus)({
    slug: "done",
    label: "Done",
    icon: "Circle",
    color: "#a3a3a3",
    orderKey: "a0",
    createdBy: "user-1",
    createdAt: "2026-01-01T00:00:00.000Z"
  })
  registry = Registry.make()
  render(
    <RegistryContext.Provider value={registry}>
      <StatusDeleteConfirm
        status={status}
        statuses={[status]}
        orgSlug="org"
        slug="project"
      />
    </RegistryContext.Provider>
  )
  fireEvent.click(
    screen.getByRole("button", { name: m.tickets_status_delete_button() })
  )
  const deleteButton = () =>
    screen.getByRole("button", { name: m.tickets_status_delete_button() })
  await waitFor(() => expect(respond).toBeDefined())
  expect(deleteButton().hasAttribute("disabled")).toBe(true)
  respond?.(Response.json({ _tag: "Forbidden" }, { status: 403 }))
  fireEvent.click(
    await screen.findByRole("button", { name: m.error_page_retry_button() })
  )
  expect(deleteButton().hasAttribute("disabled")).toBe(true)
  await waitFor(() => expect(reads).toBe(2))
  respond?.(
    Response.json({
      rules: {
        branch_linked: null,
        pr_draft_opened: null,
        pr_opened: null,
        pr_merged: "done",
        pr_closed: null,
        branch_deleted: null
      },
      forwardOnly: true
    })
  )
  await screen.findByText(m.tickets_status_delete_resets_git_automation())
  expect(deleteButton().hasAttribute("disabled")).toBe(false)
})
