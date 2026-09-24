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
import { TemplateEditorPage } from "./TemplateEditorPage"

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
  LexicalEditor: ({
    markdown,
    onChange,
    onDraftChange,
    blocks
  }: LexicalEditorProps) => (
    <textarea
      aria-label="Body"
      data-mode={blocks?.mode}
      defaultValue={markdown}
      onChange={(event) => {
        onDraftChange?.(event.target.value)
        void Promise.resolve(onChange(event.target.value)).catch(() => {})
      }}
    />
  )
}))

const fetchStub = stubFetch()

const referenceBody = [
  formatTicketBlock("context", ""),
  formatTicketBlock("steps-to-reproduce", "")
].join("\n\n")

const blocks = [
  asBlock(blockDraft("context")),
  asBlock(blockDraft("steps-to-reproduce"))
]

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

describe("TemplateEditorPage", () => {
  it("loads the template into a template-mode editor with its fields", async () => {
    fetchStub.set(
      libraryServer(
        libraryOf(blocks, [asTemplate(templateDraft("bugs", referenceBody))]),
        calls
      )
    )
    renderWithRegistry(
      registry,
      <TemplateEditorPage
        scope={projectScope("acme", "web")}
        templateKey="bugs"
      />
    )

    const body = await screen.findByLabelText<HTMLTextAreaElement>("Body")
    expect(body.dataset.mode).toBe("template")
    expect(body.value).toBe(referenceBody)
    expect(screen.getByLabelText<HTMLInputElement>("Name").value).toBe(
      "Bug report"
    )
    expect(screen.getByLabelText<HTMLInputElement>("Description").value).toBe(
      "Something is broken"
    )
    expect(screen.queryByLabelText(/^Default type: /)).toBeNull()
    expect(screen.getByText("Default for")).toBeTruthy()
  })

  it("autosaves the body with references to this layer's file", async () => {
    fetchStub.set(
      libraryServer(
        libraryOf(blocks, [asTemplate(templateDraft("bugs", referenceBody))]),
        calls
      )
    )
    renderWithRegistry(
      registry,
      <TemplateEditorPage
        scope={projectScope("acme", "web")}
        templateKey="bugs"
      />
    )

    const next = `Triage first.\n\n${referenceBody}`
    fireEvent.change(await screen.findByLabelText("Body"), {
      target: { value: next }
    })

    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]).toEqual({
      method: "PATCH",
      path: "/orgs/acme/projects/web/library/templates/bugs",
      body: { body: next }
    })
    await waitFor(() => expect(screen.getByText("Saved")).toBeTruthy())
  })

  it("customizes an inherited template into this layer on the first edit", async () => {
    fetchStub.set(
      libraryServer(
        libraryOf(blocks, [
          asTemplate(templateDraft("bugs", referenceBody), "org")
        ]),
        calls
      )
    )
    renderWithRegistry(
      registry,
      <TemplateEditorPage
        scope={projectScope("acme", "web")}
        templateKey="bugs"
      />
    )

    const description = await screen.findByLabelText("Description")
    fireEvent.change(description, { target: { value: "Broken things" } })
    fireEvent.blur(description)
    const edited = `${referenceBody}\n\nNotes go here.`
    fireEvent.change(screen.getByLabelText("Body"), {
      target: { value: edited }
    })

    await waitFor(() => expect(writes()).toHaveLength(2))
    expect(writes()[0]).toMatchObject({
      method: "POST",
      path: "/orgs/acme/projects/web/library/templates",
      body: {
        key: "bugs",
        name: "Bug report",
        description: "Broken things",
        body: referenceBody
      }
    })
    expect(writes()[1]).toEqual({
      method: "PATCH",
      path: "/orgs/acme/projects/web/library/templates/bugs",
      body: { body: edited }
    })
  })

  it("previews the expanded body a new ticket would get", async () => {
    fetchStub.set(
      libraryServer(
        libraryOf(blocks, [asTemplate(templateDraft("bugs", referenceBody))]),
        calls
      )
    )
    renderWithRegistry(
      registry,
      <TemplateEditorPage scope={orgScope("acme")} templateKey="bugs" />
    )

    await screen.findByLabelText("Body")
    fireEvent.click(screen.getByRole("button", { name: "Preview" }))

    const preview = document.querySelector<HTMLElement>(
      "[data-template-preview]"
    )!
    expect(within(preview).getByText("Context")).toBeTruthy()
    expect(within(preview).getByText("Steps to reproduce")).toBeTruthy()
    expect(preview.textContent).not.toContain("{{")
  })

  it("shows members a read-only preview without an editor", async () => {
    fetchStub.set(
      libraryServer(
        libraryOf(
          blocks,
          [asTemplate(templateDraft("bugs", referenceBody))],
          false
        ),
        calls
      )
    )
    renderWithRegistry(
      registry,
      <TemplateEditorPage
        scope={projectScope("acme", "web")}
        templateKey="bugs"
      />
    )

    await waitFor(() =>
      expect(document.querySelector("[data-template-preview]")).not.toBeNull()
    )
    expect(screen.queryByLabelText("Body")).toBeNull()
    expect(screen.queryByRole("button", { name: "Preview" })).toBeNull()
  })
})
