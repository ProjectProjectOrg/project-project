import { RegistryContext } from "@effect/atom-react"
import {
  BlockDefinition,
  BUILTIN_BLOCKS,
  EMPTY_LAYER,
  Library,
  resolveLibrary,
  type BlockDraft,
  type BlockKey,
  type Layer
} from "@pp/shared"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react"
import * as Schema from "effect/Schema"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { stubFetch } from "@/api/testFetch"

import { LibraryPage } from "./LibraryPage"
import { orgScope, projectScope, type LibraryScope } from "./libraryScope"

const navigate = vi.fn()

vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  useNavigate: () => navigate,
  Link: ({
    children,
    className,
    "aria-label": label
  }: Readonly<{
    children?: ReactNode
    className?: string
    "aria-label"?: string
  }>) => (
    <a href="#entry" className={className} aria-label={label}>
      {children}
    </a>
  )
}))

const fetchStub = stubFetch()
const encodeLibrary = Schema.encodeSync(Library)
const encodeBlock = Schema.encodeSync(BlockDefinition)

const builtin = (key: string): BlockDraft =>
  BUILTIN_BLOCKS.find((block) => block.key === key)!

const triage: BlockDraft = {
  ...builtin("notes"),
  key: "triage" as BlockKey,
  name: "Triage"
}

const orgLayer: Layer = {
  ...EMPTY_LAYER,
  blocks: [
    builtin("context"),
    builtin("definition-of-done"),
    builtin("notes"),
    triage
  ]
}

const projectLayer: Layer = {
  blocks: [{ ...builtin("context"), name: "Context (web)" }],
  hiddenBlocks: ["notes"]
}

const projectLibrary = (canEdit: boolean) =>
  resolveLibrary({ org: orgLayer, project: projectLayer }, canEdit)

const orgLibrary = (layer: Layer = orgLayer) =>
  resolveLibrary({ org: layer, project: null }, true)

type Call = Readonly<{ method: string; path: string; body: unknown }>

let registry: AtomRegistry.AtomRegistry
let calls: Array<Call>

let served: Library

const serve = (
  library: Library,
  respond: (
    call: Call
  ) => Response | undefined | Promise<Response | undefined> = () => undefined
) => {
  served = library
  fetchStub.set(async (input, init) => {
    const href =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    const path = new URL(href, "http://localhost").pathname.replace(
      /^\/api/,
      ""
    )
    const method = init?.method ?? "GET"
    const text =
      init?.body === undefined || init.body === null
        ? ""
        : await new Response(init.body).text()
    const call = { method, path, body: text === "" ? null : JSON.parse(text) }
    calls.push(call)
    if (method === "GET") return Response.json(encodeLibrary(served))
    return (await respond(call)) ?? new Response(null, { status: 204 })
  })
}

const renderPage = (scope: LibraryScope) =>
  render(
    <RegistryContext.Provider value={registry}>
      <LibraryPage scope={scope} />
    </RegistryContext.Provider>
  )

const cardOf = (key: string) =>
  document.querySelector<HTMLElement>(`[data-library-card="${key}"]`)

const originOf = (key: string) =>
  cardOf(key)?.querySelector("[data-origin]")?.textContent ?? null

const tileOf = (key: string) =>
  document.querySelector<HTMLElement>(`[data-gallery-tile="${key}"]`)

const actionsIn = (element: HTMLElement) =>
  within(element)
    .queryAllByRole("button")
    .map((button) => button.textContent)

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  registry = AtomRegistry.make()
  calls = []
  navigate.mockReset()
})

afterEach(() => {
  cleanup()
  registry.dispose()
  vi.unstubAllGlobals()
})

describe("LibraryPage", () => {
  it("labels each block by its origin and folds hidden ones away", async () => {
    serve(projectLibrary(true))
    renderPage(projectScope("acme", "web"))

    await waitFor(() => expect(cardOf("definition-of-done")).not.toBeNull())
    expect(originOf("definition-of-done")).toBe("org")
    expect(originOf("triage")).toBe("org")
    expect(originOf("context")).toBe("project · overrides org")
    expect(cardOf("notes")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: /1 hidden/ }))
    const hidden = document.querySelector<HTMLElement>(
      '[data-hidden-row="notes"]'
    )!
    expect(within(hidden).getByRole("button").textContent).toMatch("Unhide")
  })

  it("offers actions by origin to editors", async () => {
    serve(projectLibrary(true))
    renderPage(projectScope("acme", "web"))

    await waitFor(() => expect(cardOf("triage")).not.toBeNull())
    expect(actionsIn(cardOf("definition-of-done")!)).toEqual([
      "Customize",
      "Duplicate",
      "Hide"
    ])
    expect(actionsIn(cardOf("triage")!)).toEqual([
      "Customize",
      "Duplicate",
      "Hide"
    ])
    expect(actionsIn(cardOf("context")!)).toEqual(["Duplicate", "Reset"])
    expect(screen.getByRole("button", { name: "New block" })).toBeTruthy()
  })

  it("shows members the lists without any actions", async () => {
    serve(projectLibrary(false))
    renderPage(projectScope("acme", "web"))

    await waitFor(() => expect(cardOf("triage")).not.toBeNull())
    for (const key of ["definition-of-done", "triage", "context"])
      expect(actionsIn(cardOf(key)!)).toEqual([])
    expect(screen.queryByRole("button", { name: "New block" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull()
    expect(
      screen.getAllByRole("button", { name: "Preview" }).length
    ).toBeGreaterThan(0)
  })

  it("adds a gallery block to this layer and moves it into the list", async () => {
    const library = projectLibrary(true)
    const steps = builtin("steps-to-reproduce")
    const adopted: BlockDefinition = {
      ...steps,
      origin: "project",
      shadows: null,
      hidden: false
    }
    serve(library, (call) => {
      if (call.method !== "POST") return undefined
      served = { ...library, blocks: [...library.blocks, adopted] }
      return Response.json(encodeBlock(adopted))
    })
    renderPage(projectScope("acme", "web"))

    await waitFor(() => expect(tileOf("steps-to-reproduce")).not.toBeNull())
    fireEvent.click(within(tileOf("steps-to-reproduce")!).getByText("Add"))

    await waitFor(() => expect(cardOf("steps-to-reproduce")).not.toBeNull())
    expect(originOf("steps-to-reproduce")).toBeNull()
    const posts = calls.filter((call) => call.method === "POST")
    expect(posts.map((call) => call.path)).toEqual([
      "/orgs/acme/projects/web/library/blocks"
    ])
    expect(posts[0]!.body).toMatchObject({
      key: "steps-to-reproduce",
      name: steps.name
    })
  })

  it("teaches the gallery when nothing is adopted yet", async () => {
    serve(orgLibrary(EMPTY_LAYER))
    renderPage(orgScope("acme"))

    expect(await screen.findByText("no blocks")).toBeTruthy()
    expect(
      screen.getByText("Add one from the gallery below, or create your own.")
    ).toBeTruthy()
    expect(tileOf("context")).not.toBeNull()
  })

  it("focuses the previewed tile and brings the others back", async () => {
    serve(projectLibrary(true))
    renderPage(projectScope("acme", "web"))

    await waitFor(() => expect(tileOf("environment")).not.toBeNull())
    const others = ["steps-to-reproduce", "out-of-scope"]
    for (const key of others) expect(tileOf(key)).not.toBeNull()

    fireEvent.click(within(tileOf("environment")!).getByText("Preview"))
    expect(
      document
        .querySelector('[data-gallery="block"]')!
        .hasAttribute("data-focused")
    ).toBe(true)
    await waitFor(() => {
      for (const key of others) expect(tileOf(key)).toBeNull()
    })
    const tile = tileOf("environment")!
    expect(within(tile).getByText("Close")).toBeTruthy()
    expect(tile.querySelector(".prose-md")).not.toBeNull()

    fireEvent.click(within(tile).getByText("Close"))
    for (const key of others) expect(tileOf(key)).not.toBeNull()
    expect(
      tileOf("environment")!.querySelector("[data-gallery-preview]")
    ).toBeNull()
  })

  it("shows this layer's blocks as cards under a heading with New block", async () => {
    serve(projectLibrary(true))
    renderPage(projectScope("acme", "web"))

    await waitFor(() => expect(cardOf("triage")).not.toBeNull())
    const section = screen
      .getByRole("heading", { name: "Your blocks" })
      .closest("section")!
    expect(
      within(section).getByRole("button", { name: "New block" }).className
    ).toMatch("bg-foreground")
    const card = cardOf("triage")!
    expect(within(card).getByRole("link", { name: "Triage" })).toBeTruthy()
    expect(card.querySelector("[data-block-icon]")).not.toBeNull()

    fireEvent.click(within(section).getByRole("button", { name: "New block" }))
    expect(within(section).getByPlaceholderText("Block name")).toBeTruthy()
    expect(
      within(section).queryByRole("button", { name: "New block" })
    ).toBeNull()
  })

  it("leaves the origin off cards that belong to the page's own layer", async () => {
    serve(orgLibrary())
    renderPage(orgScope("acme"))

    await waitFor(() => expect(cardOf("triage")).not.toBeNull())
    expect(originOf("triage")).toBeNull()
  })

  it("hides an inherited block and unhides it again", async () => {
    const library = projectLibrary(true)
    let settleUnhide = () => {}
    serve(library, (call) => {
      if (call.method === "POST")
        served = {
          ...library,
          blocks: library.blocks.map((block) =>
            block.key === "triage"
              ? { ...block, origin: "project", shadows: "org", hidden: true }
              : block
          )
        }
      if (call.method !== "DELETE") return undefined
      served = library
      // Held open, so the row unmounts before the mutation settles.
      return new Promise<undefined>((resolve) => {
        settleUnhide = () => resolve(undefined)
      })
    })
    renderPage(projectScope("acme", "web"))

    await waitFor(() => expect(cardOf("triage")).not.toBeNull())
    fireEvent.click(within(cardOf("triage")!).getByText("Hide"))
    await waitFor(() => expect(cardOf("triage")).toBeNull())
    expect(calls).toContainEqual({
      method: "POST",
      path: "/orgs/acme/projects/web/library/blocks/triage/hide",
      body: null
    })

    fireEvent.click(screen.getByRole("button", { name: /2 hidden/ }))
    const hidden = document.querySelector<HTMLElement>(
      '[data-hidden-row="triage"]'
    )!
    await act(async () => {
      fireEvent.click(within(hidden).getByText("Unhide"))
    })
    await waitFor(() =>
      expect(calls).toContainEqual({
        method: "DELETE",
        path: "/orgs/acme/projects/web/library/blocks/triage",
        body: null
      })
    )
    await waitFor(() =>
      expect(document.querySelector('[data-hidden-row="triage"]')).toBeNull()
    )
    settleUnhide()
    // The Unhide row unmounts on the optimistic update. The mutation must
    // still finish and refetch.
    await waitFor(() => {
      const unhide = calls.findIndex((call) => call.method === "DELETE")
      expect(
        calls
          .slice(unhide + 1)
          .some(
            (call) =>
              call.method === "GET" &&
              call.path === "/orgs/acme/projects/web/library"
          )
      ).toBe(true)
    })
  })

  it("creates a new block with a slugified key and opens it", async () => {
    serve(projectLibrary(true), (call) =>
      call.method === "POST"
        ? Response.json(
            encodeBlock({
              ...(call.body as BlockDraft),
              origin: "org",
              shadows: null,
              hidden: false
            })
          )
        : undefined
    )
    renderPage(orgScope("acme"))

    fireEvent.click(await screen.findByRole("button", { name: "New block" }))
    fireEvent.change(screen.getByPlaceholderText("Block name"), {
      target: { value: "Security review" }
    })
    expect(screen.getByDisplayValue("security-review")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Create" }))

    await waitFor(() => expect(navigate).toHaveBeenCalled())
    expect(navigate).toHaveBeenCalledWith({
      to: "/orgs/$orgSlug/settings/templates/blocks/$blockKey",
      params: { orgSlug: "acme", blockKey: "security-review" }
    })
    expect(calls.find((call) => call.method === "POST")?.path).toBe(
      "/orgs/acme/library/blocks"
    )
  })

  it("keeps the new form's failure apart from a card's failure", async () => {
    serve(projectLibrary(true), (call) =>
      call.method !== "POST"
        ? undefined
        : (call.body as BlockDraft).key === "security-review"
          ? Response.json(
              { _tag: "Conflict", reason: "key_taken" },
              { status: 409 }
            )
          : Response.json(
              { _tag: "Validation", reason: "attachments_not_allowed" },
              { status: 400 }
            )
    )
    renderPage(projectScope("acme", "web"))

    fireEvent.click(await screen.findByRole("button", { name: "New block" }))
    fireEvent.change(screen.getByPlaceholderText("Block name"), {
      target: { value: "Security review" }
    })
    fireEvent.click(screen.getByRole("button", { name: "Create" }))
    expect(
      await screen.findByText(
        "That key is already used here. Pick another key."
      )
    ).toBeTruthy()

    fireEvent.click(
      within(cardOf("triage")!).getByRole("button", { name: "Duplicate" })
    )
    await waitFor(() =>
      expect(cardOf("triage")!.textContent).toMatch("can't contain attachments")
    )
    expect(
      screen.getByText("That key is already used here. Pick another key.")
    ).toBeTruthy()
    expect(screen.getAllByText(/can't contain attachments/)).toHaveLength(1)
  })

  it("lists blocks with a synced label", async () => {
    serve(projectLibrary(true))
    renderPage(projectScope("acme", "web"))

    expect(
      await screen.findByRole("heading", { name: "Your blocks" })
    ).toBeTruthy()
    await waitFor(() => expect(cardOf("definition-of-done")).not.toBeNull())
    expect(cardOf("definition-of-done")!.textContent).toMatch("synced")
    expect(cardOf("context")!.textContent).not.toMatch("synced")
    expect(cardOf("notes")).toBeNull()
    expect(tileOf("notes")).toBeNull()
    expect(tileOf("definition-of-done")).toBeNull()
    expect(tileOf("environment")).not.toBeNull()
  })
})
