import {
  BUILTIN_BLOCKS,
  formatTicketBlock,
  stripHints,
  type BlockDefinition,
  type TagName
} from "@pp/shared"
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { stubFetch } from "@/api/testFetch"
import {
  libraryOf,
  libraryServer,
  renderWithRegistry,
  type Call
} from "@/components/Library/libraryEditorTestKit"

import { SaveAsTemplateForm } from "./SaveAsTemplatePopover"

vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  Link: ({
    children,
    className
  }: Readonly<{ children?: ReactNode; className?: string }>) => (
    <a href="#template" className={className}>
      {children}
    </a>
  )
}))

const fetchStub = stubFetch()

const context: BlockDefinition = {
  ...BUILTIN_BLOCKS.find((block) => block.key === "context")!,
  origin: "project",
  shadows: null,
  hidden: false
}

const library = libraryOf([context], [])

const ticket = {
  type: "bug",
  priority: "high",
  tags: ["auth" as TagName]
} as const

const body = [
  formatTicketBlock("context", stripHints(context.content)),
  formatTicketBlock("notes", "## Notes\n\nKept")
].join("\n\n")

let registry: AtomRegistry.AtomRegistry
let calls: Array<Call>

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
  fetchStub.set(libraryServer(library, calls))
})

afterEach(() => {
  cleanup()
  registry.dispose()
})

const renderForm = (layers: ReadonlyArray<"project" | "org">) =>
  renderWithRegistry(
    registry,
    <SaveAsTemplateForm
      orgSlug="acme"
      slug="web"
      ticket={ticket}
      body={body}
      library={library}
      layers={layers}
    />
  )

describe("SaveAsTemplateForm", () => {
  it("prefills the name from the type and summarizes the blocks", () => {
    renderForm(["project"])
    expect(screen.getByLabelText<HTMLInputElement>("Name").value).toBe("Bug")
    expect(document.querySelector("[data-save-as-summary]")!.textContent).toBe(
      "2 blocks, 1 customized"
    )
    expect(screen.queryByRole("button", { name: "Org" })).toBeNull()
  })

  it("posts references for pristine blocks and inline customizations", async () => {
    renderForm(["project", "org"])
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Login bug" }
    })
    fireEvent.click(screen.getByLabelText("Include tags"))
    fireEvent.click(screen.getByRole("button", { name: "Save template" }))

    await waitFor(
      () =>
        expect(
          document.querySelector("[data-save-as-template-saved]")
        ).not.toBeNull(),
      { timeout: 3000 }
    )
    const post = calls.find((call) => call.method === "POST")!
    expect(post.path).toBe("/orgs/acme/projects/web/library/templates")
    expect(post.body).toEqual({
      key: "login-bug",
      name: "Login bug",
      icon: "LayoutTemplate",
      color: null,
      description: "",
      priority: null,
      tags: ["auth"],
      body: [
        formatTicketBlock("context", ""),
        formatTicketBlock("notes", "## Notes\n\nKept")
      ].join("\n\n")
    })
    expect(screen.getByText("Open template")).toBeTruthy()
  })

  it("saves to the org layer when org is picked", async () => {
    renderForm(["project", "org"])
    fireEvent.click(screen.getByRole("button", { name: "Org" }))
    fireEvent.click(screen.getByRole("button", { name: "Save template" }))

    await waitFor(
      () => expect(calls.some((call) => call.method === "POST")).toBe(true),
      { timeout: 3000 }
    )
    const post = calls.find((call) => call.method === "POST")!
    expect(post.path).toBe("/orgs/acme/library/templates")
    expect((post.body as { body: string }).body).toContain(
      formatTicketBlock("context", stripHints(context.content))
    )
  })
})
