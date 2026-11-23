// @vitest-environment jsdom
import { buildEditorFromExtensions } from "@lexical/extension"
import { createEmptyHistoryState, registerHistory } from "@lexical/history"
import {
  $convertFromMarkdownString,
  $convertToMarkdownString
} from "@lexical/mdast"
import { blockLookupFor, formatTicketBlock, type Library } from "@pp/shared"
import {
  $getRoot,
  UNDO_COMMAND,
  configExtension,
  defineExtension,
  type LexicalEditor,
  type NodeKey
} from "lexical"
import { describe, expect, it } from "vitest"

import { MarkdownExtension } from "../markdown-extension"
import { BUILTIN_LIBRARY } from "./block-chrome"
import {
  $isSyncedBlockNode,
  DETACH_SYNCED_BLOCK_COMMAND
} from "./synced-block-node"
import { registerSyncedBlocks } from "./synced-blocks"
import { toggleTaskAtLine } from "./synced-content"
import { TicketBlockMarkdownExtension } from "./ticket-block-markdown"
import { $isTicketBlockNode } from "./ticket-block-node"

const DOD = "definition-of-done"

const DEFINITION = [
  "## Definition of done",
  "",
  "- [ ] Reviewed and merged",
  "- [ ] Tests cover the change",
  "- [ ] Docs updated where behaviour changed",
  "- [ ] Verified in the target environment"
].join("\n")

const STALE_SNAPSHOT = [
  "## Definition of done",
  "",
  "- [x] Reviewed and merged",
  "- [ ] Old item that was removed"
].join("\n")

const syncedBody = (snapshot: string) =>
  `Intro.\n\n${formatTicketBlock(DOD, snapshot, { sync: true })}\n`

const withBlocks = (
  edit: (blocks: Library["blocks"]) => Library["blocks"]
) => ({ ...BUILTIN_LIBRARY, blocks: edit(BUILTIN_LIBRARY.blocks) })

const WITHOUT_DOD = withBlocks((blocks) =>
  blocks.filter((block) => block.key !== DOD)
)

function makeEditor(emptyAsReference = false) {
  return buildEditorFromExtensions(
    defineExtension({
      name: "synced-blocks-test",
      dependencies: [
        MarkdownExtension,
        configExtension(TicketBlockMarkdownExtension, { emptyAsReference })
      ],
      onError: (error) => {
        throw error
      }
    })
  )
}

const load = (editor: LexicalEditor, markdown: string) =>
  editor.update(() => $convertFromMarkdownString(markdown), { discrete: true })

const flush = (editor: LexicalEditor) =>
  editor.update(() => {}, { discrete: true })

const exported = (editor: LexicalEditor) =>
  editor.read(() => $convertToMarkdownString())

const syncedKey = (editor: LexicalEditor) =>
  editor.read(
    () => $getRoot().getChildren().find($isSyncedBlockNode)?.getKey() ?? null
  )

const syncWith = (editor: LexicalEditor, library: Library) => {
  const removed: Array<NodeKey> = []
  const unregister = registerSyncedBlocks(
    editor,
    blockLookupFor(library),
    (key) => removed.push(key)
  )
  flush(editor)
  return { removed, unregister }
}

describe("synced block markdown", () => {
  it("imports a sync opener as a synced node and round trips it", () => {
    const editor = makeEditor()
    const body = syncedBody(DEFINITION)
    load(editor, body)
    expect(syncedKey(editor)).not.toBeNull()
    expect(exported(editor)).toBe(body.trim())
  })

  it("keeps plain blocks as editable ticket blocks", () => {
    const editor = makeEditor()
    load(editor, formatTicketBlock("notes", "## Notes\n\nText"))
    const kinds = editor.read(() =>
      $getRoot()
        .getChildren()
        .map((node) => node.getType())
    )
    expect(kinds).toEqual(["ticket-block"])
  })

  it("imports empty blocks as references in template mode and exports them empty", () => {
    const editor = makeEditor(true)
    const body = [
      formatTicketBlock("context", ""),
      formatTicketBlock("notes", "## Notes\n\nCustom")
    ].join("\n\n")
    load(editor, body)
    const modes = editor.read(() =>
      $getRoot()
        .getChildren()
        .map((node) => ($isSyncedBlockNode(node) ? node.getMode() : "copy"))
    )
    expect(modes).toEqual(["reference", "copy"])
    expect(exported(editor)).toBe(body)
  })
})

describe("synced blocks against the library", () => {
  it("writes the current definition with this ticket's ticks", () => {
    const editor = makeEditor()
    load(editor, syncedBody(STALE_SNAPSHOT))
    syncWith(editor, BUILTIN_LIBRARY)
    const markdown = exported(editor)
    expect(markdown).toContain('<block type="definition-of-done" sync>')
    expect(markdown).toContain("- [x] Reviewed and merged")
    expect(markdown).toContain("- [ ] Verified in the target environment")
    expect(markdown).not.toContain("Old item")
  })

  it("persists a toggled tick into the ticket markdown", () => {
    const editor = makeEditor()
    load(editor, syncedBody(DEFINITION))
    syncWith(editor, BUILTIN_LIBRARY)
    editor.update(
      () => {
        const node = $getRoot().getChildren().find($isSyncedBlockNode)
        node?.setSnapshot(toggleTaskAtLine(node.getSnapshot(), 4))
      },
      { discrete: true }
    )
    expect(exported(editor)).toContain("- [x] Tests cover the change")
  })

  it("keeps ticks when the definition changes and drops removed items", () => {
    const editor = makeEditor()
    load(
      editor,
      syncedBody(DEFINITION.replace("- [ ] Reviewed", "- [x] Reviewed"))
    )
    const first = syncWith(editor, BUILTIN_LIBRARY)
    first.unregister()
    syncWith(
      editor,
      withBlocks((blocks) =>
        blocks.map((block) =>
          block.key === DOD
            ? {
                ...block,
                content:
                  "## Definition of done\n\n- [ ] Reviewed and merged\n- [ ] Released"
              }
            : block
        )
      )
    )
    expect(exported(editor)).toBe(
      `Intro.\n\n${formatTicketBlock(DOD, "## Definition of done\n\n- [x] Reviewed and merged\n- [ ] Released", { sync: true })}`
    )
  })

  it("turns a block whose definition was deleted into an editable copy", () => {
    const editor = makeEditor()
    load(editor, syncedBody(STALE_SNAPSHOT))
    const { removed } = syncWith(editor, WITHOUT_DOD)
    const kinds = editor.read(() =>
      $getRoot()
        .getChildren()
        .map((node) => node.getType())
    )
    expect(kinds).toContain("ticket-block")
    expect(kinds).not.toContain("synced-block")
    expect(removed).toHaveLength(1)
    expect(exported(editor)).toBe(
      `Intro.\n\n${formatTicketBlock(DOD, STALE_SNAPSHOT)}`
    )
  })

  it("detaches into a copy with the same content in one undo step", () => {
    const editor = makeEditor()
    registerHistory(editor, createEmptyHistoryState(), 0)
    load(editor, syncedBody(DEFINITION))
    syncWith(editor, BUILTIN_LIBRARY)
    const before = exported(editor)
    const key = syncedKey(editor)
    if (key === null) throw new Error("no synced block")
    const content = editor.read(() => {
      const node = $getRoot().getChildren().find($isSyncedBlockNode)
      return toggleTaskAtLine(node?.getSnapshot() ?? "", 3)
    })
    editor.update(
      () => {
        editor.dispatchCommand(DETACH_SYNCED_BLOCK_COMMAND, { key, content })
      },
      { discrete: true }
    )
    const detached = editor.read(
      () => $getRoot().getChildren().filter($isTicketBlockNode).length
    )
    expect(detached).toBe(1)
    expect(exported(editor)).toBe(
      `Intro.\n\n${formatTicketBlock(DOD, content)}`
    )
    editor.update(
      () => {
        editor.dispatchCommand(UNDO_COMMAND, undefined)
      },
      { discrete: true }
    )
    expect(exported(editor)).toBe(before)
  })
})
