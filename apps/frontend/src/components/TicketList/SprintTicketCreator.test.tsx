import { RegistryContext } from "@effect/atom-react"
import { GroupId, Library, TicketId } from "@pp/shared"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react"
import * as Schema from "effect/Schema"
import * as Registry from "effect/unstable/reactivity/AtomRegistry"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { stubFetch } from "@/api/testFetch"
import { BUILTIN_LIBRARY } from "@/components/blocks/blockChrome"

import { SprintTicketCreator } from "./SprintTicketCreator"

vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  useNavigate: () => vi.fn()
}))

const fetchStub = stubFetch()
const encodeLibrary = Schema.encodeSync(Library)

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    }
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const chooseType = async (label: string) => {
  fireEvent.click(screen.getByLabelText(/^Type: /))
  fireEvent.click(await screen.findByRole("menuitem", { name: label }))
}

const submit = (input: HTMLInputElement, title: string) => {
  fireEvent.change(input, { target: { value: title } })
  fireEvent.submit(input.closest("form")!)
}

it.each(["focus", "hover"] as const)(
  "activates on %s, debounces typing, and ignores a late earlier response",
  async (intent) => {
    const registry = Registry.make()
    const searches = new Map<string, (response: Response) => void>()
    fetchStub.set((input: RequestInfo | URL) => {
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        "http://localhost"
      )
      return new Promise<Response>((resolve) => {
        if (url.pathname.endsWith("/search"))
          searches.set(url.searchParams.get("q") ?? "", resolve)
      })
    })
    try {
      render(
        <RegistryContext.Provider value={registry}>
          <SprintTicketCreator
            orgSlug="org"
            slug="project"
            groupId={Schema.decodeSync(GroupId)("G-1")}
            excludeIds={new Set()}
          />
        </RegistryContext.Provider>
      )
      const input = screen.getByRole("textbox")
      expect(searches.size).toBe(0)
      if (intent === "hover") fireEvent.pointerEnter(input)
      else fireEvent.focus(input)
      await waitFor(() => expect([...searches.keys()]).toEqual([""]))
      if (intent === "hover") fireEvent.focus(input)
      fireEvent.change(input, { target: { value: "ear" } })
      fireEvent.change(input, { target: { value: "early" } })
      expect([...searches.keys()]).toEqual([""])
      await waitFor(() => expect([...searches.keys()]).toEqual(["", "early"]))
      fireEvent.change(input, { target: { value: "latest" } })
      await waitFor(() =>
        expect([...searches.keys()]).toEqual(["", "early", "latest"])
      )
      const ticket = (id: string, title: string) => ({
        id,
        title,
        status: "todo",
        type: "feat",
        priority: "med",
        tags: [],
        branch: null,
        pr: null,
        prState: null,
        lastTransitionedPr: null,
        gitState: { tag: "no_branch" },
        assignees: [],
        archivedAt: null,
        createdBy: "user-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      })
      await act(async () =>
        searches.get("latest")?.(
          Response.json([ticket("T-2", "Latest result")])
        )
      )
      await screen.findByText("Latest result")
      await act(async () =>
        searches.get("early")?.(Response.json([ticket("T-1", "Early result")]))
      )
      expect(screen.queryByText("Early result")).toBeNull()
      expect(screen.getByText("Latest result")).toBeTruthy()
    } finally {
      cleanup()
      registry.dispose()
    }
  }
)

type Posted = Readonly<Record<string, unknown>>

const setupForTemplates = () => {
  const registry = Registry.make()
  const posted: Array<Posted> = []
  fetchStub.set((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      "http://localhost"
    )
    if (url.pathname.endsWith("/library"))
      return Promise.resolve(Response.json(encodeLibrary(BUILTIN_LIBRARY)))
    if (url.pathname.endsWith("/search"))
      return Promise.resolve(Response.json([]))
    if (init?.method === "POST" && url.pathname.endsWith("/tickets/quick")) {
      posted.push(
        JSON.parse(new TextDecoder().decode(init.body as Uint8Array)) as Posted
      )
    }
    return new Promise<Response>(() => {})
  })
  render(
    <RegistryContext.Provider value={registry}>
      <SprintTicketCreator
        orgSlug="org"
        slug="project"
        groupId={Schema.decodeSync(GroupId)("G-1")}
        excludeIds={new Set()}
      />
    </RegistryContext.Provider>
  )
  const input = screen.getByRole("textbox") as HTMLInputElement
  fireEvent.focus(input)
  return { registry, posted, input }
}

it("keeps an explicitly chosen type when / picks a template whose default type differs", async () => {
  const { registry, posted, input } = setupForTemplates()
  try {
    await chooseType("Feature")
    fireEvent.change(input, { target: { value: "/" } })
    fireEvent.change(input, { target: { value: "/bug" } })
    await waitFor(() =>
      expect(
        screen.getAllByRole("option").map((option) => option.textContent)
      ).toEqual(["Bug report"])
    )
    fireEvent.keyDown(input, { key: "Enter" })
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
    expect(screen.getByLabelText(/^Type: /).textContent).toContain("Feature")
    submit(input, "Still a feature")
    await waitFor(() => expect(posted).toHaveLength(1))
    expect(posted[0]).toEqual({
      title: "Still a feature",
      type: "feat",
      template: "bug-report"
    })
  } finally {
    registry.dispose()
  }
})

it("applies the template's type when no type was chosen explicitly", async () => {
  const { registry, posted, input } = setupForTemplates()
  try {
    fireEvent.change(input, { target: { value: "/" } })
    fireEvent.change(input, { target: { value: "/bug" } })
    await waitFor(() =>
      expect(
        screen.getAllByRole("option").map((option) => option.textContent)
      ).toEqual(["Bug report"])
    )
    fireEvent.keyDown(input, { key: "Enter" })
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
    expect(screen.getByLabelText(/^Type: /).textContent).toContain("Bug")
    submit(input, "Login loops")
    await waitFor(() => expect(posted).toHaveLength(1))
    expect(posted[0]).toEqual({
      title: "Login loops",
      type: "bug",
      template: "bug-report"
    })
  } finally {
    registry.dispose()
  }
})

it("adds an epic's chosen open sub-tickets in one bulk request", async () => {
  const registry = Registry.make()
  const bulk: Array<Posted> = []
  const ticket = (
    id: string,
    title: string,
    extra: Readonly<Record<string, unknown>> = {}
  ) => ({
    id,
    title,
    status: "todo",
    type: "feat",
    priority: "med",
    tags: [],
    branch: null,
    pr: null,
    prState: null,
    lastTransitionedPr: null,
    gitState: { tag: "no_branch" },
    assignees: [],
    parent: null,
    archivedAt: null,
    createdBy: "user-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...extra
  })
  fetchStub.set((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      "http://localhost"
    )
    if (url.pathname.endsWith("/search"))
      return Promise.resolve(
        Response.json([
          ticket("T-4", "Passkeys"),
          ticket("T-1", "Estimation", { type: "epic" })
        ])
      )
    if (url.pathname.endsWith("/tickets") && init?.method !== "POST")
      return Promise.resolve(
        Response.json({
          items: ["T-2", "T-3", "T-5"].map((id) => ({
            ticket: ticket(id, `Sub-ticket ${id}`, { parent: "T-1" }),
            orderKey: id
          })),
          nextCursor: null
        })
      )
    if (init?.method === "POST" && url.pathname.endsWith("/tickets/bulk")) {
      bulk.push(
        JSON.parse(new TextDecoder().decode(init.body as Uint8Array)) as Posted
      )
      return Promise.resolve(Response.json({ tickets: [], sprint: null }))
    }
    return new Promise<Response>(() => {})
  })
  try {
    render(
      <RegistryContext.Provider value={registry}>
        <SprintTicketCreator
          orgSlug="org"
          slug="project"
          groupId={Schema.decodeSync(GroupId)("G-1")}
          excludeIds={new Set([Schema.decodeSync(TicketId)("T-5")])}
        />
      </RegistryContext.Provider>
    )
    const input = screen.getByRole("textbox") as HTMLInputElement
    fireEvent.focus(input)
    const options = await screen.findAllByRole("button", { name: /^T-\d/ })
    expect(options[0]?.textContent).toContain("Estimation")
    fireEvent.mouseDown(options[0]!)
    await screen.findByText("Sub-ticket T-3")
    expect(screen.getByText("In this sprint")).toBeTruthy()
    fireEvent.keyDown(input, { key: "ArrowDown" })
    fireEvent.keyDown(input, { key: " " })
    fireEvent.submit(input.closest("form")!)
    await waitFor(() => expect(bulk).toHaveLength(1))
    expect(bulk[0]).toEqual({ tickets: ["T-2"], patch: { sprint: "G-1" } })
  } finally {
    cleanup()
    registry.dispose()
  }
})
