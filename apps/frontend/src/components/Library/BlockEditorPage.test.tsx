import { formatTicketBlock } from "@pp/shared"
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within
} from "@testing-library/react"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { stubFetch } from "@/api/testFetch"
import type { LexicalEditorProps } from "@/components/LexicalEditor"

import { BlockEditorPage } from "./BlockEditorPage"
import {
  asBlock,
  asTemplate,
  blockDraft,
  libraryOf,
  libraryServer,
  renderWithRegistry,
  templateDraft,
  type Call
} from "./libraryEditorTestKit"
import { orgScope, projectScope } from "./libraryScope"

vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  useNavigate: () => vi.fn(),
  Link: ({
    children,
    className
  }: Readonly<{ children?: ReactNode; className?: string }>) => (
    <a href="#entry" className={className}>
      {children}
    </a>
  )
}))

vi.mock("@/components/LexicalEditor", async (original) => ({
  ...(await original<typeof import("@/components/LexicalEditor")>()),
  LexicalEditor: ({ markdown, onChange, blocks }: LexicalEditorProps) => (
    <textarea
      aria-label="Content"
      data-mode={blocks?.mode}
      defaultValue={markdown}
      onChange={(event) =>
        void Promise.resolve(onChange(event.target.value)).catch(() => {})
      }
    />
  )
}))

const fetchStub = stubFetch()

const context = asBlock(blockDraft("context"))
const steps = asBlock(blockDraft("steps-to-reproduce"))

const library = (canEdit = true) =>
  libraryOf(
    [context, steps],
    [
      asTemplate(templateDraft("bugs", formatTicketBlock("context", ""))),
      asTemplate(
        templateDraft("spikes", formatTicketBlock("context", ""), {
          name: "Spike"
        })
      ),
      asTemplate(
        templateDraft("chores", formatTicketBlock("steps-to-reproduce", ""), {
          name: "Chore"
        })
      )
    ],
    canEdit
  )

let registry: AtomRegistry.AtomRegistry
let calls: Array<Call>

const writes = () => calls.filter((call) => call.method !== "GET")

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
})

afterEach(() => {
  cleanup()
  registry.dispose()
})

describe("BlockEditorPage", () => {
  it("loads the definition, hints included, into a definition-mode editor", async () => {
    fetchStub.set(libraryServer(library(), calls))
    renderWithRegistry(
      registry,
      <BlockEditorPage scope={projectScope("acme", "web")} blockKey="context" />
    )

    const content = await screen.findByLabelText<HTMLTextAreaElement>("Content")
    expect(content.dataset.mode).toBe("definition")
    expect(content.value).toBe(context.content)
    expect(content.value).toContain("{{")
    expect(screen.getByLabelText<HTMLInputElement>("Name").value).toBe(
      "Context"
    )
  })

  it("autosaves content edits", async () => {
    fetchStub.set(libraryServer(library(), calls))
    renderWithRegistry(
      registry,
      <BlockEditorPage scope={orgScope("acme")} blockKey="context" />
    )

    const next = "## Context\n\n{{Why now}}"
    fireEvent.change(await screen.findByLabelText("Content"), {
      target: { value: next }
    })

    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]).toEqual({
      method: "POST",
      path: "/orgs/acme/library/blocks",
      body: expect.objectContaining({ key: "context", content: next })
    })
  })

  it("rejects nested blocks without saving", async () => {
    fetchStub.set(libraryServer(library(), calls))
    renderWithRegistry(
      registry,
      <BlockEditorPage scope={projectScope("acme", "web")} blockKey="context" />
    )

    fireEvent.change(await screen.findByLabelText("Content"), {
      target: {
        value: `## Context\n\n${formatTicketBlock("notes", "Nested")}`
      }
    })

    expect((await screen.findByRole("alert")).textContent).toBe(
      "A block can't contain other blocks."
    )
    expect(writes()).toEqual([])
  })

  it("turns sync on from the switch", async () => {
    fetchStub.set(libraryServer(library(), calls))
    renderWithRegistry(
      registry,
      <BlockEditorPage scope={projectScope("acme", "web")} blockKey="context" />
    )

    fireEvent.click(await screen.findByRole("switch"))

    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]).toEqual({
      method: "PATCH",
      path: "/orgs/acme/projects/web/library/blocks/context",
      body: { sync: true }
    })
  })

  it("lists the templates that use the block", async () => {
    fetchStub.set(libraryServer(library(), calls))
    renderWithRegistry(
      registry,
      <BlockEditorPage scope={projectScope("acme", "web")} blockKey="context" />
    )

    const label = await screen.findByText("Used in 2 templates")
    const field = label.parentElement!
    expect(
      within(field)
        .getAllByRole("link")
        .map((link) => link.textContent)
    ).toEqual(["Bug report", "Spike"])
  })

  it("shows members the content read-only with hints stripped", async () => {
    fetchStub.set(libraryServer(library(false), calls))
    renderWithRegistry(
      registry,
      <BlockEditorPage scope={projectScope("acme", "web")} blockKey="context" />
    )

    await screen.findByText("Used in 2 templates")
    expect(screen.queryByLabelText("Content")).toBeNull()
    expect(screen.getByRole("switch").getAttribute("aria-disabled")).toBe(
      "true"
    )
    expect(document.body.textContent).not.toContain("{{")
  })
})
