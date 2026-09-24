import { CodeNode } from "@lexical/code"
import { ListItemNode, ListNode } from "@lexical/list"
import {
  $convertFromMarkdownString,
  $convertToMarkdownString
} from "@lexical/markdown"
import { LexicalComposer } from "@lexical/react/LexicalComposer"
import { ContentEditable } from "@lexical/react/LexicalContentEditable"
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary"
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"
import { HeadingNode } from "@lexical/rich-text"
import { formatTicketBlock, type Library } from "@pp/shared"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { BUILTIN_LIBRARY } from "@/components/blocks/blockChrome"

import { MARKDOWN_TRANSFORMERS } from "../../LexicalEditor"
import { TicketBlockNode } from "../TicketBlockNode"
import type { EditorBlocks } from "./editorBlocks"
import { EditorBlocksProvider } from "./editorBlocksContext"
import { SyncedBlockNode } from "./SyncedBlockNode"
import { SyncedBlocksPlugin } from "./SyncedBlocksPlugin"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const BODY = `Intro.\n\n${formatTicketBlock(
  "definition-of-done",
  "## Definition of done\n\n- [x] Reviewed and merged",
  { sync: true }
)}`

const ADOPTED_LIBRARY: Library = { ...BUILTIN_LIBRARY }

function renderEditor(
  canEdit: EditorBlocks["canEdit"],
  onEditDefinition: EditorBlocks["onEditDefinition"] = () => {},
  library: Library = BUILTIN_LIBRARY
) {
  const blocks: EditorBlocks = {
    mode: "ticket",
    library,
    canEdit,
    onEditDefinition
  }
  const changes: Array<string> = []
  render(
    <div className="prose-md block-gutter">
      <EditorBlocksProvider
        blocks={blocks}
        transformers={MARKDOWN_TRANSFORMERS}
      >
        <LexicalComposer
          initialConfig={{
            namespace: "synced-block-test",
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
            contentEditable={<ContentEditable className="lexical-content" />}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <SyncedBlocksPlugin library={library} />
          <OnChangePlugin
            onChange={(state) =>
              state.read(() =>
                changes.push($convertToMarkdownString(MARKDOWN_TRANSFORMERS))
              )
            }
          />
        </LexicalComposer>
      </EditorBlocksProvider>
    </div>
  )
  return changes
}

it("renders the live definition read-only with the synced chip", async () => {
  renderEditor({ org: false, project: false })
  expect(
    await screen.findByText("Verified in the target environment")
  ).toBeDefined()
  expect(screen.getByText(/^Synced from/)).toBeDefined()
  expect(screen.queryByRole("button", { name: "Edit" })).toBeNull()
  const frame = document.querySelector<HTMLElement>(".ticket-block[data-sync]")
  expect(frame?.contentEditable).toBe("false")
})

it("never offers edit on a synced block from the built-ins", async () => {
  renderEditor({ org: true, project: true })
  await screen.findByText("Verified in the target environment")
  expect(screen.queryByRole("button", { name: "Edit" })).toBeNull()
  expect(screen.queryByText(/^Managed in/)).toBeNull()
  expect(screen.getByRole("button", { name: "Detach" })).toBeDefined()
})

it("offers edit to people who can change the definition", async () => {
  const onEdit = vi.fn<EditorBlocks["onEditDefinition"]>()
  renderEditor({ org: true, project: false }, onEdit, ADOPTED_LIBRARY)
  fireEvent.click(await screen.findByRole("button", { name: "Edit" }))
  expect(onEdit).toHaveBeenCalledWith(
    "block",
    "definition-of-done",
    expect.any(String)
  )
})

it("says where the definition is managed to everyone else", async () => {
  renderEditor({ org: false, project: false }, () => {}, ADOPTED_LIBRARY)
  expect(await screen.findByText("Managed in org settings")).toBeDefined()
  expect(screen.queryByRole("button", { name: "Edit" })).toBeNull()
})

it("persists a tick into the markdown", async () => {
  const changes = renderEditor({ org: false, project: false })
  await screen.findByText("Tests cover the change")
  const box = document.querySelectorAll<HTMLInputElement>(
    ".ticket-block input[type=checkbox]"
  )[1]
  expect(box.disabled).toBe(false)
  fireEvent.click(box)
  await waitFor(() =>
    expect(changes.at(-1)).toContain("- [x] Tests cover the change")
  )
  expect(changes.at(-1)).toContain("- [x] Reviewed and merged")
})

it("detaches into an editable copy", async () => {
  const changes = renderEditor({ org: false, project: false })
  fireEvent.click(await screen.findByRole("button", { name: "Detach" }))
  await waitFor(() =>
    expect(changes.at(-1)).toContain('<block type="definition-of-done">')
  )
  expect(document.querySelector(".ticket-block[data-sync]")).toBeNull()
  expect(changes.at(-1)).toContain("- [x] Reviewed and merged")
})
