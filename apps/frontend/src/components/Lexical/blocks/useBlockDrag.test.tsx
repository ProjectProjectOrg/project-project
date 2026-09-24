import { CodeNode } from "@lexical/code"
import { ListItemNode, ListNode } from "@lexical/list"
import { $convertFromMarkdownString } from "@lexical/markdown"
import { LexicalComposer } from "@lexical/react/LexicalComposer"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { ContentEditable } from "@lexical/react/LexicalContentEditable"
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"
import { HeadingNode } from "@lexical/rich-text"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { COMMAND_PRIORITY_CRITICAL } from "lexical"
import { useEffect } from "react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import { BUILTIN_LIBRARY } from "@/components/blocks/blockChrome"

import { MARKDOWN_TRANSFORMERS } from "../../LexicalEditor"
import { TicketBlockNode } from "../TicketBlockNode"
import { OPEN_BLOCK_MENU_COMMAND } from "./blockCommands"
import { BlockGutterPlugin } from "./BlockGutterPlugin"
import { SyncedBlockNode } from "./SyncedBlockNode"

const BODY = [
  '<block type="acceptance-criteria">\n\n## Acceptance criteria\n\n- [ ] One\n\n</block>',
  '<block type="notes">\n\n## Notes\n\nText\n\n</block>'
].join("\n\n")

class NoopResizeObserver {
  observe() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", NoopResizeObserver)
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const index = Array.from(this.parentElement?.children ?? []).indexOf(this)
      return DOMRect.fromRect({ x: 0, y: index * 40, width: 600, height: 32 })
    }
  )
  HTMLElement.prototype.setPointerCapture = () => {}
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function MenuSpy({ onOpen }: Readonly<{ onOpen: () => void }>) {
  const [editor] = useLexicalComposerContext()
  useEffect(
    () =>
      editor.registerCommand(
        OPEN_BLOCK_MENU_COMMAND,
        () => {
          onOpen()
          return true
        },
        COMMAND_PRIORITY_CRITICAL
      ),
    [editor, onOpen]
  )
  return null
}

it("does not open the block menu on the release after Escape cancels a drag", async () => {
  const onOpen = vi.fn()
  render(
    <div className="prose-md block-gutter">
      <LexicalComposer
        initialConfig={{
          namespace: "block-drag-test",
          nodes: [
            CodeNode,
            HeadingNode,
            ListNode,
            ListItemNode,
            TicketBlockNode,
            SyncedBlockNode
          ],
          editorState: () =>
            $convertFromMarkdownString(BODY, MARKDOWN_TRANSFORMERS),
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
          blocks={{
            library: BUILTIN_LIBRARY,
            canEdit: { org: false, project: false }
          }}
          transformers={MARKDOWN_TRANSFORMERS}
        />
        <MenuSpy onOpen={onOpen} />
      </LexicalComposer>
    </div>
  )
  const grip = await screen.findByRole("button", {
    name: "Acceptance criteria block"
  })

  fireEvent.pointerDown(grip, {
    button: 0,
    pointerId: 1,
    clientX: 0,
    clientY: 5
  })
  fireEvent.pointerMove(grip, { pointerId: 1, clientX: 0, clientY: 30 })
  await act(async () => {})
  fireEvent.keyDown(window, { key: "Escape" })
  fireEvent.pointerUp(grip, { pointerId: 1, clientX: 0, clientY: 30 })
  fireEvent.click(grip)

  expect(onOpen).not.toHaveBeenCalled()
  fireEvent.click(grip)
  expect(onOpen).toHaveBeenCalledTimes(1)
})
