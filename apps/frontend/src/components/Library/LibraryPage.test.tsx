import { RegistryContext } from "@effect/atom-react"
import {
  BlockDefinition,
  BUILTIN_BLOCKS,
  BUILTIN_TEMPLATES,
  EMPTY_LAYER,
  Library,
  LibraryDefaults,
  TemplateDefinition,
  resolveLibrary,
  type Layer,
  type TemplateDraft,
  type TemplateKey
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

import { LibraryPage, type LibraryTab } from "./LibraryPage"
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
const encodeTemplate = Schema.encodeSync(TemplateDefinition)
const encodeBlock = Schema.encodeSync(BlockDefinition)
const encodeDefaults = Schema.encodeSync(LibraryDefaults)

const builtin = (key: string): TemplateDraft =>
  BUILTIN_TEMPLATES.find((template) => template.key === key)!

const triage: TemplateDraft = {
  ...builtin("chore"),
  key: "triage" as TemplateKey,
  name: "Triage"
}

const orgLayer: Layer = {
  ...EMPTY_LAYER,
  blocks: BUILTIN_BLOCKS.filter((block) =>
    ["context", "definition-of-done"].includes(block.key)
  ),
  templates: [builtin("bug-report"), builtin("chore"), builtin("spike"), triage]
}

const projectLayer: Layer = {
  ...EMPTY_LAYER,
  templates: [{ ...builtin("chore"), name: "Chore (web)" }],
  hiddenTemplates: ["spike" as TemplateKey]
}

const orgDefaults = { bug: "bug-report" as TemplateKey }

const projectLibrary = (canEdit: boolean) =>
  resolveLibrary(
    { org: orgLayer, project: projectLayer },
    { org: orgDefaults, project: {} },
    canEdit
  )

const orgLibrary = (layer: Layer = orgLayer) =>
  resolveLibrary(
    { org: layer, project: null },
    { org: orgDefaults, project: null },
    true
  )

const defaultsOf = (library: Library) => ({
  defaults: library.defaults,
  ownDefaults: library.ownDefaults,
  inheritedDefaults: library.inheritedDefaults
})

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

const renderPage = (scope: LibraryScope, tab: LibraryTab = "templates") =>
  render(
    <RegistryContext.Provider value={registry}>
      <LibraryPage scope={scope} tab={tab} onTabChange={() => {}} />
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
  it("labels each template by its origin and folds hidden ones away", async () => {
    serve(projectLibrary(true))
    renderPage(projectScope("acme", "web"))

    await waitFor(() => expect(cardOf("bug-report")).not.toBeNull())
    expect(originOf("bug-report")).toBe("org")
    expect(originOf("triage")).toBe("org")
    expect(originOf("chore")).toBe("project · overrides org")
    expect(cardOf("spike")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: /1 hidden/ }))
    const hidden = document.querySelector<HTMLElement>(
      '[data-hidden-row="spike"]'
    )!
    expect(within(hidden).getByRole("button").textContent).toMatch("Unhide")
  })

  it("offers actions by origin to editors", async () => {
    serve(projectLibrary(true))
    renderPage(projectScope("acme", "web"))

    await waitFor(() => expect(cardOf("bug-report")).not.toBeNull())
    expect(actionsIn(cardOf("bug-report")!)).toEqual([
      "Customize",
      "Duplicate",
      "Hide"
    ])
    expect(actionsIn(cardOf("triage")!)).toEqual([
      "Customize",
      "Duplicate",
      "Hide"
    ])
    expect(actionsIn(cardOf("chore")!)).toEqual(["Duplicate", "Reset"])
    expect(screen.getByRole("button", { name: "New template" })).toBeTruthy()
  })

  it("shows members the lists without any actions", async () => {
    serve(projectLibrary(false))
    renderPage(projectScope("acme", "web"))

    await waitFor(() => expect(cardOf("bug-report")).not.toBeNull())
    for (const key of ["bug-report", "triage", "chore"])
      expect(actionsIn(cardOf(key)!)).toEqual([])
    expect(screen.queryByRole("button", { name: "New template" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull()
    expect(
      screen.queryByRole("button", { name: /Default template for/ })
    ).toBeNull()
    expect(screen.getAllByRole("button", { name: "Preview" })).toHaveLength(6)
  })

  it("adds a gallery template to this layer and moves it into the list", async () => {
    const library = projectLibrary(true)
    const incident = builtin("incident")
    const adopted: TemplateDefinition = {
      ...incident,
      origin: "project",
      shadows: null,
      hidden: false
    }
    serve(library, (call) => {
      if (call.method !== "POST") return undefined
      if (call.path.endsWith("/blocks"))
        return Response.json(
          encodeBlock({
            ...(call.body as BlockDefinition),
            origin: "project",
            shadows: null,
            hidden: false
          })
        )
      served = { ...library, templates: [...library.templates, adopted] }
      return Response.json(encodeTemplate(adopted))
    })
    renderPage(projectScope("acme", "web"))

    await waitFor(() => expect(tileOf("incident")).not.toBeNull())
    fireEvent.click(within(tileOf("incident")!).getByText("Add"))

    await waitFor(() => expect(cardOf("incident")).not.toBeNull())
    // The tile hands its layoutId to the card and stays mounted until that
    // shared animation ends, which never runs without layout in jsdom, so
    // its removal is checked in the browser rather than here.
    expect(originOf("incident")).toBeNull()
    const posts = calls.filter(
      (call) =>
        call.method === "POST" && call.path.endsWith("/library/templates")
    )
    expect(posts.map((call) => call.path)).toEqual([
      "/orgs/acme/projects/web/library/templates"
    ])
    expect(posts[0]!.body).toMatchObject({
      key: "incident",
      name: incident.name
    })
  })

  it("adopts the gallery blocks a template references before the template", async () => {
    const library = orgLibrary()
    serve(library, (call) => {
      if (call.method !== "POST") return undefined
      const placed = {
        ...(call.body as Readonly<Record<string, unknown>>),
        origin: "org",
        shadows: null,
        hidden: false
      }
      return Response.json(
        call.path.endsWith("/blocks")
          ? encodeBlock(placed as BlockDefinition)
          : encodeTemplate(placed as TemplateDefinition)
      )
    })
    renderPage(orgScope("acme"))

    await waitFor(() => expect(tileOf("feature")).not.toBeNull())
    fireEvent.click(within(tileOf("feature")!).getByText("Add"))

    await waitFor(() =>
      expect(
        calls
          .filter((call) => call.method === "POST")
          .map((call) => [call.path, (call.body as { key: string }).key])
      ).toEqual([
        ["/orgs/acme/library/blocks", "acceptance-criteria"],
        ["/orgs/acme/library/blocks", "out-of-scope"],
        ["/orgs/acme/library/templates", "feature"]
      ])
    )
  })

  it("adopts the block behind a customized copy in the template", async () => {
    const library = orgLibrary({
      ...orgLayer,
      templates: orgLayer.templates.filter(
        (template) => template.key !== "spike"
      )
    })
    serve(library, (call) => {
      if (call.method !== "POST") return undefined
      const placed = {
        ...(call.body as Readonly<Record<string, unknown>>),
        origin: "org",
        shadows: null,
        hidden: false
      }
      return Response.json(
        call.path.endsWith("/blocks")
          ? encodeBlock(placed as BlockDefinition)
          : encodeTemplate(placed as TemplateDefinition)
      )
    })
    renderPage(orgScope("acme"))

    await waitFor(() => expect(tileOf("spike")).not.toBeNull())
    fireEvent.click(within(tileOf("spike")!).getByText("Add"))

    await waitFor(() =>
      expect(
        calls
          .filter((call) => call.method === "POST")
          .map((call) => (call.body as { key: string }).key)
      ).toContain("spike")
    )
    expect(
      calls
        .filter(
          (call) => call.method === "POST" && call.path.endsWith("/blocks")
        )
        .map((call) => (call.body as { key: string }).key)
    ).toContain("approach")
  })

  it("teaches the gallery when nothing is adopted yet", async () => {
    serve(orgLibrary(EMPTY_LAYER))
    renderPage(orgScope("acme"))

    expect(await screen.findByText("no templates")).toBeTruthy()
    expect(
      screen.getByText("Add one from the gallery below, or create your own.")
    ).toBeTruthy()
    expect(tileOf("bug-report")).not.toBeNull()
  })

  it("previews a gallery template in place", async () => {
    serve(projectLibrary(true))
    renderPage(projectScope("acme", "web"))

    await waitFor(() => expect(tileOf("release")).not.toBeNull())
    fireEvent.click(within(tileOf("release")!).getByText("Preview"))
    expect(within(tileOf("release")!).getByText("Close")).toBeTruthy()
    expect(tileOf("release")!.querySelector(".prose-md")).not.toBeNull()
  })

  it("focuses the previewed tile, hangs its block icons in the rail and brings the others back", async () => {
    serve(projectLibrary(true))
    renderPage(projectScope("acme", "web"))

    await waitFor(() => expect(tileOf("release")).not.toBeNull())
    const others = ["user-story", "incident"]
    for (const key of others) expect(tileOf(key)).not.toBeNull()

    fireEvent.click(within(tileOf("release")!).getByText("Preview"))
    expect(
      document
        .querySelector('[data-gallery="template"]')!
        .hasAttribute("data-focused")
    ).toBe(true)
    await waitFor(() => {
      for (const key of others) expect(tileOf(key)).toBeNull()
    })
    const tile = tileOf("release")!
    expect(tile.classList.contains("block-rail-scope")).toBe(true)
    expect(
      tile
        .querySelector("[data-gallery-preview]")!
        .classList.contains("block-rail-sheet")
    ).toBe(true)

    fireEvent.click(within(tile).getByText("Close"))
    for (const key of others) expect(tileOf(key)).not.toBeNull()
    expect(
      tileOf("release")!.querySelector("[data-gallery-preview]")
    ).toBeNull()
  })

  it("shows this layer's templates as cards under a heading with New template", async () => {
    serve(projectLibrary(true))
    renderPage(projectScope("acme", "web"))

    await waitFor(() => expect(cardOf("bug-report")).not.toBeNull())
    const section = screen
      .getByRole("heading", { name: "Your templates" })
      .closest("section")!
    expect(
      within(section).getByRole("button", { name: "New template" }).className
    ).toMatch("bg-foreground")
    const card = cardOf("bug-report")!
    expect(within(card).getByRole("link", { name: "Bug report" })).toBeTruthy()
    expect(card.querySelector("[data-block-icon]")).not.toBeNull()
    expect(card.textContent).toMatch("Steps to reproduce")
    expect(card.textContent).not.toMatch("default for")

    fireEvent.click(
      within(section).getByRole("button", { name: "New template" })
    )
    expect(within(section).getByPlaceholderText("Template name")).toBeTruthy()
    expect(
      within(section).queryByRole("button", { name: "New template" })
    ).toBeNull()
  })

  it("leaves the origin off cards that belong to the page's own layer", async () => {
    serve(orgLibrary())
    renderPage(orgScope("acme"))

    await waitFor(() => expect(cardOf("bug-report")).not.toBeNull())
    expect(originOf("bug-report")).toBeNull()
  })

  it("lays the defaults out as one calm row per type", async () => {
    serve(projectLibrary(true))
    renderPage(projectScope("acme", "web"))

    const heading = await screen.findByRole("heading", {
      name: "Default template per type"
    })
    const rows = heading
      .closest("section")!
      .querySelectorAll<HTMLElement>("li[data-default-type]")
    expect([...rows].map((row) => row.dataset.defaultType)).toEqual([
      "feat",
      "bug",
      "chore",
      "other"
    ])
    const bug = rows[1]!
    expect(bug.textContent).toMatch(/^Bug/)
    expect(
      within(bug).getByRole("button", { name: "Default template for Bug" })
        .textContent
    ).toBe("Bug report")
  })

  it("hides an inherited template and unhides it again", async () => {
    const library = projectLibrary(true)
    let settleUnhide = () => {}
    serve(library, (call) => {
      if (call.method === "POST")
        served = {
          ...library,
          templates: library.templates.map((template) =>
            template.key === "triage"
              ? { ...template, origin: "project", shadows: "org", hidden: true }
              : template
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
      path: "/orgs/acme/projects/web/library/templates/triage/hide",
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
        path: "/orgs/acme/projects/web/library/templates/triage",
        body: null
      })
    )
    await waitFor(() =>
      expect(document.querySelector('[data-hidden-row="triage"]')).toBeNull()
    )
    settleUnhide()
    // The Unhide row unmounts on the optimistic update. The mutation must
    // still finish and refetch, or inherited defaults stay stale.
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

  it("creates a new template with a slugified key and opens it", async () => {
    serve(projectLibrary(true), (call) =>
      call.method === "POST"
        ? Response.json(
            encodeTemplate({
              ...(call.body as TemplateDraft),
              origin: "org",
              shadows: null,
              hidden: false
            })
          )
        : undefined
    )
    renderPage(orgScope("acme"))

    fireEvent.click(await screen.findByRole("button", { name: "New template" }))
    fireEvent.change(screen.getByPlaceholderText("Template name"), {
      target: { value: "Security review" }
    })
    expect(screen.getByDisplayValue("security-review")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Create" }))

    await waitFor(() => expect(navigate).toHaveBeenCalled())
    expect(navigate).toHaveBeenCalledWith({
      to: "/orgs/$orgSlug/settings/templates/$templateKey",
      params: { orgSlug: "acme", templateKey: "security-review" }
    })
    expect(calls.find((call) => call.method === "POST")?.path).toBe(
      "/orgs/acme/library/templates"
    )
  })

  it("keeps the new form's failure apart from a row's failure", async () => {
    serve(projectLibrary(true), (call) =>
      call.method !== "POST"
        ? undefined
        : (call.body as TemplateDraft).key === "security-review"
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

    fireEvent.click(await screen.findByRole("button", { name: "New template" }))
    fireEvent.change(screen.getByPlaceholderText("Template name"), {
      target: { value: "Security review" }
    })
    fireEvent.click(screen.getByRole("button", { name: "Create" }))
    expect(
      await screen.findByText(
        "That key is already used here. Pick another key."
      )
    ).toBeTruthy()

    fireEvent.click(
      within(cardOf("bug-report")!).getByRole("button", { name: "Duplicate" })
    )
    await waitFor(() =>
      expect(cardOf("bug-report")!.textContent).toMatch(
        "can't contain attachments"
      )
    )
    expect(
      screen.getByText("That key is already used here. Pick another key.")
    ).toBeTruthy()
    expect(screen.getAllByText(/can't contain attachments/)).toHaveLength(1)
  })

  it("overrides the org default for a type and resets it", async () => {
    const library = projectLibrary(true)
    serve(library, (call) => {
      if (call.method !== "PATCH") return undefined
      const body = call.body as Readonly<{
        defaults: Record<string, TemplateKey | null>
        reset?: ReadonlyArray<string>
      }>
      served = resolveLibrary(
        { org: orgLayer, project: projectLayer },
        {
          org: orgDefaults,
          project: body.reset === undefined ? body.defaults : {}
        },
        true
      )
      return Response.json(encodeDefaults(defaultsOf(served)))
    })
    renderPage(projectScope("acme", "web"))

    const trigger = await screen.findByRole("button", {
      name: "Default template for Bug"
    })
    expect(trigger.textContent).toBe("Bug report")
    expect(
      document.querySelector('[data-default-type="bug"]')!.textContent
    ).toMatch("from org")
    fireEvent.click(trigger)
    fireEvent.click(await screen.findByRole("menuitem", { name: "Triage" }))

    await waitFor(() =>
      expect(calls).toContainEqual({
        method: "PATCH",
        path: "/orgs/acme/projects/web/library/defaults",
        body: { defaults: { bug: "triage" } }
      })
    )
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Default template for Bug" })
          .textContent
      ).toBe("Triage")
    )

    fireEvent.click(
      screen.getByRole("button", { name: "Default template for Bug" })
    )
    fireEvent.click(
      await screen.findByRole("menuitem", {
        name: "Use org default (Bug report)"
      })
    )
    await waitFor(() =>
      expect(calls).toContainEqual({
        method: "PATCH",
        path: "/orgs/acme/projects/web/library/defaults",
        body: { defaults: {}, reset: ["bug"] }
      })
    )
  })

  it("pulses only the default being changed", async () => {
    serve(projectLibrary(true))
    renderPage(projectScope("acme", "web"))
    const bug = await screen.findByRole("button", {
      name: "Default template for Bug"
    })
    fetchStub.set((_input, init) =>
      (init?.method ?? "GET") === "GET"
        ? Promise.resolve(Response.json(encodeLibrary(served)))
        : new Promise<Response>(() => {})
    )
    fireEvent.click(bug)
    fireEvent.click(await screen.findByRole("menuitem", { name: "Triage" }))

    const chore = screen.getByRole("button", {
      name: "Default template for Chore"
    })
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Default template for Bug" })
          .querySelector(".animate-pulse")
      ).not.toBeNull()
    )
    expect(chore.querySelector(".animate-pulse")).toBeNull()
  })

  it("sets org defaults from the org page", async () => {
    const library = orgLibrary()
    serve(library, (call) =>
      call.method === "PATCH"
        ? Response.json(encodeDefaults(defaultsOf(library)))
        : undefined
    )
    renderPage(orgScope("acme"))

    const trigger = await screen.findByRole("button", {
      name: "Default template for Chore"
    })
    expect(trigger.textContent).toBe("Blank")
    fireEvent.click(trigger)
    fireEvent.click(await screen.findByRole("menuitem", { name: "Chore" }))
    await waitFor(() =>
      expect(calls).toContainEqual({
        method: "PATCH",
        path: "/orgs/acme/library/defaults",
        body: { defaults: { chore: "chore" } }
      })
    )
  })

  it("lists blocks with a synced label on the blocks tab", async () => {
    serve(projectLibrary(true))
    renderPage(projectScope("acme", "web"), "blocks")

    expect(
      await screen.findByRole("heading", { name: "Your blocks" })
    ).toBeTruthy()
    expect(screen.getByRole("button", { name: "New block" })).toBeTruthy()

    await waitFor(() => expect(cardOf("definition-of-done")).not.toBeNull())
    expect(cardOf("definition-of-done")!.textContent).toMatch("synced")
    expect(cardOf("context")!.textContent).not.toMatch("synced")
    expect(cardOf("notes")).toBeNull()
    expect(tileOf("notes")).not.toBeNull()
    expect(tileOf("definition-of-done")).toBeNull()
    expect(tileOf("incident")).toBeNull()
  })
})
