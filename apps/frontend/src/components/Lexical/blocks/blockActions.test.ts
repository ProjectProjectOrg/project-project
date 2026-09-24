import { CodeExtension } from "@lexical/code"
import {
  HorizontalRuleExtension,
  buildEditorFromExtensions
} from "@lexical/extension"
import { HistoryExtension } from "@lexical/history"
import { LinkExtension } from "@lexical/link"
import { CheckListExtension, ListExtension } from "@lexical/list"
import {
  $convertFromMarkdownString,
  $convertToMarkdownString
} from "@lexical/markdown"
import { RichTextExtension } from "@lexical/rich-text"
import { TableExtension } from "@lexical/table"
import { formatTicketBlock, stripHints } from "@pp/shared"
import {
  $getRoot,
  HISTORY_PUSH_TAG,
  defineExtension,
  type LexicalEditor,
  type LexicalNode
} from "lexical"
import { describe, expect, it } from "vitest"

import { BUILTIN_LIBRARY, lookupFor } from "@/components/blocks/blockChrome"

import { MARKDOWN_TRANSFORMERS } from "../../LexicalEditor"
import { TicketBlockExtension } from "../TicketBlockExtension"
import { $isTicketBlockNode } from "../TicketBlockNode"
import {
  $topLevelBlocks,
  $unwrapBlock,
  type TopLevelBlockNode
} from "./blockCommands"
import {
  $createSyncedBlockNode,
  $isSyncedBlockNode,
  SyncedBlockExtension
} from "./SyncedBlockNode"

const lookup = lookupFor(BUILTIN_LIBRARY)

const definitionOf = (key: string) => {
  const definition = lookup(key)
  if (definition === undefined) throw new Error(`no block ${key}`)
  return definition
}

const block = (key: string, content = stripHints(definitionOf(key).content)) =>
  formatTicketBlock(key, content)

const BODY = [
  "Intro.",
  block("acceptance-criteria"),
  "Between.",
  block("notes", "## Notes\n\nSome notes.")
].join("\n\n")

function editorWith(markdown: string): LexicalEditor {
  const editor = buildEditorFromExtensions(
    defineExtension({
      name: "block-actions-test",
      dependencies: [
        RichTextExtension,
        HistoryExtension,
        ListExtension,
        CheckListExtension,
        CodeExtension,
        LinkExtension,
        HorizontalRuleExtension,
        TableExtension,
        TicketBlockExtension,
        SyncedBlockExtension
      ],
      $initialEditorState: () => {
        $convertFromMarkdownString(markdown, MARKDOWN_TRANSFORMERS)
      },
      onError: (error) => {
        throw error
      }
    })
  )
  editor.update(() => {}, { discrete: true })
  return editor
}

const run = (editor: LexicalEditor, fn: () => void) =>
  editor.update(fn, { discrete: true, tag: HISTORY_PUSH_TAG })

const markdown = (editor: LexicalEditor) =>
  editor
    .getEditorState()
    .read(() => $convertToMarkdownString(MARKDOWN_TRANSFORMERS))

const describeNode = (node: LexicalNode): string =>
  $isTicketBlockNode(node) || $isSyncedBlockNode(node)
    ? `block:${node.getBlockType()}`
    : node.getTextContent().trim() === ""
      ? "blank"
      : `text:${node.getTextContent()}`

const outline = (editor: LexicalEditor): ReadonlyArray<string> =>
  editor.getEditorState().read(() => $getRoot().getChildren().map(describeNode))

const $blockOf = (key: string): TopLevelBlockNode => {
  const node = $topLevelBlocks().find(
    (candidate) => candidate.getBlockType() === key
  )
  if (node === undefined) throw new Error(`no ${key} in editor`)
  return node
}

describe("$unwrapBlock", () => {
  it("removes the wrapper and keeps the text as loose markdown", () => {
    const editor = editorWith(BODY)
    run(editor, () => {
      const notes = $blockOf("notes")
      $unwrapBlock(notes, "", MARKDOWN_TRANSFORMERS)
    })
    expect(outline(editor)).not.toContain("block:notes")
    expect(markdown(editor)).toContain("## Notes\n\nSome notes.")
    expect(markdown(editor)).not.toContain('<block type="notes">')
  })

  it("removes a synced wrapper by writing out its content", () => {
    const content = stripHints(definitionOf("definition-of-done").content)
    const editor = editorWith(
      formatTicketBlock("definition-of-done", content, { sync: true })
    )
    run(editor, () => {
      $unwrapBlock(
        $blockOf("definition-of-done"),
        content,
        MARKDOWN_TRANSFORMERS
      )
    })
    expect(outline(editor)).not.toContain("block:definition-of-done")
    expect(markdown(editor)).toContain("## Definition of done")
  })
})

describe("a synced block pasted into a block", () => {
  it("moves out after the block and keeps its sync", () => {
    const editor = editorWith(block("notes", "## Notes\n\nhello world"))
    run(editor, () => {
      const notes = $blockOf("notes")
      if (!$isTicketBlockNode(notes)) throw new Error("notes is not a copy")
      notes.append($createSyncedBlockNode("steps", "## Steps\n\n- [x] one"))
    })

    expect(outline(editor)).toEqual(["block:notes", "block:steps", "blank"])
    expect(markdown(editor).trim()).toBe(
      [
        block("notes", "## Notes\n\nhello world"),
        formatTicketBlock("steps", "## Steps\n\n- [x] one", { sync: true })
      ].join("\n\n")
    )
  })
})
