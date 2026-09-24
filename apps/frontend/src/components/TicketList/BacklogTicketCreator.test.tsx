import { RegistryContext } from "@effect/atom-react"
import { Library, type TicketListQuery } from "@pp/shared"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react"
import * as Schema from "effect/Schema"
import * as Registry from "effect/unstable/reactivity/AtomRegistry"
import type { ComponentProps } from "react"
import { afterEach, expect, it, vi } from "vitest"

import { stubFetch } from "@/api/testFetch"
import { BUILTIN_LIBRARY } from "@/components/blocks/blockChrome"

import { BacklogTicketCreator } from "./BacklogTicketCreator"

vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  useNavigate: () => vi.fn(),
  Link: ({
    to: _to,
    params: _params,
    ...props
  }: ComponentProps<"a"> & { to: string; params: unknown }) => <a {...props} />
}))

const fetchStub = stubFetch()
const encodeLibrary = Schema.encodeSync(Library)
const query: TicketListQuery = { sort: { key: "id", dir: "asc" } }

afterEach(() => {
  cleanup()
})

type Posted = Readonly<Record<string, unknown>>

const setup = () => {
  const registry = Registry.make()
  const posted: Array<Posted> = []
  fetchStub.set((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      "http://localhost"
    )
    if (url.pathname.endsWith("/library"))
      return Promise.resolve(Response.json(encodeLibrary(BUILTIN_LIBRARY)))
    if (init?.method === "POST" && url.pathname.endsWith("/tickets/quick")) {
      posted.push(
        JSON.parse(new TextDecoder().decode(init.body as Uint8Array)) as Posted
      )
    }
    return new Promise<Response>(() => {})
  })
  render(
    <RegistryContext.Provider value={registry}>
      <BacklogTicketCreator orgSlug="org" slug="project" query={query} />
    </RegistryContext.Provider>
  )
  const input = screen.getByRole("textbox")
  fireEvent.focus(input)
  return { registry, posted, input: input as HTMLInputElement }
}

const chooseType = async (label: string) => {
  fireEvent.click(screen.getByLabelText(/^Type: /))
  fireEvent.click(await screen.findByRole("menuitem", { name: label }))
}

const submit = (input: HTMLInputElement, title: string) => {
  fireEvent.change(input, { target: { value: title } })
  fireEvent.submit(input.closest("form")!)
}

it("has no template chip", async () => {
  const { registry } = setup()
  try {
    await chooseType("Bug")
    expect(screen.queryByLabelText(/^Template: /)).toBeNull()
  } finally {
    registry.dispose()
  }
})

it("sends the type's default template on create without a chip to pick it", async () => {
  const { registry, posted, input } = setup()
  try {
    await chooseType("Bug")
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

it("opens the template list on / in an empty title and picks with Enter", async () => {
  const { registry, posted, input } = setup()
  try {
    fireEvent.change(input, { target: { value: "/" } })
    expect(await screen.findByRole("listbox")).toBeTruthy()
    expect(screen.getByRole("option", { name: "Blank" })).toBeTruthy()
    fireEvent.change(input, { target: { value: "/bug" } })
    await waitFor(() =>
      expect(
        screen.getAllByRole("option").map((option) => option.textContent)
      ).toEqual(["Bug report"])
    )
    fireEvent.keyDown(input, { key: "Enter" })
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
    expect(input.value).toBe("")
    expect(screen.getByLabelText(/^Type: /).textContent).toContain("Bug")
    submit(input, "Sticky")
    await waitFor(() => expect(posted).toHaveLength(1))
    expect(posted[0]).toEqual({
      title: "Sticky",
      type: "bug",
      template: "bug-report"
    })
  } finally {
    registry.dispose()
  }
})

it("keeps the type when / picks a template that is no type's default", async () => {
  const { registry, posted, input } = setup()
  try {
    await chooseType("Feature")
    fireEvent.change(input, { target: { value: "/" } })
    fireEvent.change(input, { target: { value: "/incident" } })
    await waitFor(() =>
      expect(
        screen.getAllByRole("option").map((option) => option.textContent)
      ).toEqual(["Incident review"])
    )
    fireEvent.keyDown(input, { key: "Enter" })
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
    expect(screen.getByLabelText(/^Type: /).textContent).toContain("Feature")
    submit(input, "Outage")
    await waitFor(() => expect(posted).toHaveLength(1))
    expect(posted[0]).toEqual({
      title: "Outage",
      type: "feat",
      template: "incident"
    })
  } finally {
    registry.dispose()
  }
})

it("keeps an explicitly chosen type when / picks a template whose default type differs", async () => {
  const { registry, posted, input } = setup()
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
  const { registry, posted, input } = setup()
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

it("sticks with Blank from / even though the type has a default", async () => {
  const { registry, posted, input } = setup()
  try {
    await chooseType("Feature")
    fireEvent.change(input, { target: { value: "/" } })
    await screen.findByRole("listbox")
    fireEvent.mouseDown(screen.getByRole("option", { name: "Blank" }))
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
    submit(input, "Plain")
    await waitFor(() => expect(posted).toHaveLength(1))
    expect(posted[0]).toEqual({ title: "Plain", type: "feat" })
  } finally {
    registry.dispose()
  }
})

it("only triggers / on an empty title, and Escape keeps the literal slash", async () => {
  const { registry, input } = setup()
  try {
    fireEvent.change(input, { target: { value: "a" } })
    fireEvent.change(input, { target: { value: "a/" } })
    expect(screen.queryByRole("listbox")).toBeNull()
    fireEvent.change(input, { target: { value: "" } })
    fireEvent.change(input, { target: { value: "/" } })
    expect(await screen.findByRole("listbox")).toBeTruthy()
    fireEvent.keyDown(input, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
    fireEvent.change(input, { target: { value: "/b" } })
    expect(screen.queryByRole("listbox")).toBeNull()
    expect(input.value).toBe("/b")
  } finally {
    registry.dispose()
  }
})

it("explains an unknown template and refetches the library", async () => {
  const registry = Registry.make()
  let libraryFetches = 0
  fetchStub.set((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      "http://localhost"
    )
    if (url.pathname.endsWith("/library")) {
      libraryFetches++
      return Promise.resolve(Response.json(encodeLibrary(BUILTIN_LIBRARY)))
    }
    if (init?.method === "POST" && url.pathname.endsWith("/tickets/quick"))
      return Promise.resolve(
        Response.json(
          { _tag: "Validation", reason: "unknown_template:bug-report" },
          { status: 400 }
        )
      )
    return new Promise<Response>(() => {})
  })
  render(
    <RegistryContext.Provider value={registry}>
      <BacklogTicketCreator orgSlug="org" slug="project" query={query} />
    </RegistryContext.Provider>
  )
  const input = screen.getByRole("textbox") as HTMLInputElement
  fireEvent.focus(input)
  try {
    await chooseType("Bug")
    const before = libraryFetches
    submit(input, "Login loops")
    expect(
      await screen.findByText(
        'The template "bug-report" doesn\'t exist anymore.'
      )
    ).toBeTruthy()
    await waitFor(() => expect(libraryFetches).toBeGreaterThan(before))
  } finally {
    registry.dispose()
  }
})
