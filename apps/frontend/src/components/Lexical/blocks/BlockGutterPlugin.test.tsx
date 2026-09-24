import { CodeNode } from "@lexical/code"
import { ListItemNode, ListNode } from "@lexical/list"
import { $convertFromMarkdownString } from "@lexical/markdown"
import { LexicalComposer } from "@lexical/react/LexicalComposer"
import { ContentEditable } from "@lexical/react/LexicalContentEditable"
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"
import { HeadingNode } from "@lexical/rich-text"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { BUILTIN_LIBRARY } from "@/components/blocks/blockChrome"

import { MARKDOWN_TRANSFORMERS } from "../../LexicalEditor"
import { TicketBlockNode } from "../TicketBlockNode"
import { BlockGutterPlugin } from "./BlockGutterPlugin"
import { SyncedBlockNode } from "./SyncedBlockNode"

const BODY = [
  "Intro.",
  '<block type="acceptance-criteria">\n\n## Acceptance criteria\n\n- [ ] One\n\n</block>',
  "Between.",
  '<block type="release-notes">\n\n## Release notes\n\n</block>'
].join("\n\n")

const NO_EDIT = { org: false, project: false }

class NoopResizeObserver {
  observe() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", NoopResizeObserver)
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const index = Array.from(this.parentElement?.children ?? []).indexOf(this)
      const top = index * 40
      return DOMRect.fromRect({ x: 0, y: top, width: 600, height: 32 })
    }
  )
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function renderEditor(markdown: string) {
  return render(
    <div className="prose-md block-gutter">
      <LexicalComposer
        initialConfig={{
          namespace: "block-gutter-test",
          nodes: [
            CodeNode,
            HeadingNode,
            ListNode,
            ListItemNode,
            TicketBlockNode,
            SyncedBlockNode
          ],
          editorState: () =>
            $convertFromMarkdownString(markdown, MARKDOWN_TRANSFORMERS),
          onError: (error) => {
            throw error
          }
        }}
      >
        <RichTextPlugin
          contentEditable={
            <div className="relative">
              <ContentEditable className="lexical-content" />
            </div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <BlockGutterPlugin
          blocks={{ library: BUILTIN_LIBRARY, canEdit: NO_EDIT }}
          transformers={MARKDOWN_TRANSFORMERS}
        />
      </LexicalComposer>
    </div>
  )
}

it("mounts one gutter button per top-level block", async () => {
  renderEditor(BODY)
  await waitFor(() => expect(screen.getAllByRole("button")).toHaveLength(2))
  expect(
    screen.getByRole("button", { name: "Acceptance criteria block" })
  ).toBeDefined()
  expect(
    screen.getByRole("button", { name: "Release notes block" })
  ).toBeDefined()
})

it("shows the definition icon and the fallback icon in the gutter", async () => {
  renderEditor(BODY)
  const known = await screen.findByRole("button", {
    name: "Acceptance criteria block"
  })
  const unknown = screen.getByRole("button", { name: "Release notes block" })
  expect(
    known.querySelector("[data-block-icon]")?.getAttribute("data-block-icon")
  ).toBe("ListChecks")
  expect(
    unknown.querySelector("[data-block-icon]")?.getAttribute("data-block-icon")
  ).toBe("Square")
})

it("positions each button against its block's first line", async () => {
  renderEditor(BODY)
  const known = await screen.findByRole("button", {
    name: "Acceptance criteria block"
  })
  expect(known.style.top).toMatch(/px$/)
})

it("renders no buttons without blocks", async () => {
  renderEditor("Only text.")
  await waitFor(() =>
    expect(document.querySelector("[data-block-gutter]")).not.toBeNull()
  )
  expect(screen.queryAllByRole("button")).toHaveLength(0)
})
