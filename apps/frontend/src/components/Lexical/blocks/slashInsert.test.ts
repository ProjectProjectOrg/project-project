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
  $createParagraphNode,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  UNDO_COMMAND,
  defineExtension,
  type LexicalEditor,
  type LexicalNode
} from "lexical"
import { describe, expect, it } from "vitest"

import { BUILTIN_LIBRARY, lookupFor } from "@/components/blocks/blockChrome"

import { MARKDOWN_TRANSFORMERS } from "../../LexicalEditor"
import { TicketBlockExtension } from "../TicketBlockExtension"
import { $isTicketBlockNode } from "../TicketBlockNode"
import { $insertBlocksAt } from "./blockCommands"

const lookup = lookupFor(BUILTIN_LIBRARY)

const block = (key: string): string => {
  const definition = lookup(key)
  if (definition === undefined) throw new Error(`no block ${key}`)
  return formatTicketBlock(key, stripHints(definition.content))
}

function editorWith(markdown: string): LexicalEditor {
  const editor = buildEditorFromExtensions(
    defineExtension({
      name: "slash-insert-test",
      dependencies: [
        RichTextExtension,
        HistoryExtension,
        ListExtension,
        CheckListExtension,
        CodeExtension,
        LinkExtension,
        HorizontalRuleExtension,
        TableExtension,
        TicketBlockExtension
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

function $caretAfter(text: string) {
  const node = $getRoot()
    .getAllTextNodes()
    .find((candidate) => candidate.getTextContent().includes(text))
  if (node === undefined) throw new Error(`no text ${text}`)
  const offset = node.getTextContent().indexOf(text) + text.length
  node.select(offset, offset)
}

const describeNode = (node: LexicalNode): string =>
  $isTicketBlockNode(node)
    ? `block:${node.getBlockType()}`
    : `${node.getType()}:${node.getTextContent()}`

const run = (editor: LexicalEditor, fn: () => void) =>
  editor.update(fn, { discrete: true })

const read = <A>(editor: LexicalEditor, fn: () => A): A =>
  editor.getEditorState().read(fn)

const outline = (editor: LexicalEditor) =>
  read(editor, () => $getRoot().getChildren().map(describeNode))

const markdown = (editor: LexicalEditor) =>
  read(editor, () => $convertToMarkdownString(MARKDOWN_TRANSFORMERS))

const caret = (editor: LexicalEditor) =>
  read(editor, () => {
    const selection = $getSelection()
    if (!$isRangeSelection(selection)) return null
    const node = selection.anchor.getNode()
    const element = $isElementNode(node) ? node : node.getParentOrThrow()
    const owner = element
      .getParents()
      .find((parent) => $isTicketBlockNode(parent))
    return {
      text: element.getTextContent(),
      type: element.getType(),
      block: $isTicketBlockNode(owner) ? owner.getBlockType() : null
    }
  })

describe("$insertBlocksAt", () => {
  it("splits loose text at the caret and inserts the block between", () => {
    const editor = editorWith("Before after")
    run(editor, () => {
      $caretAfter("Before ")
      $insertBlocksAt(block("notes"), MARKDOWN_TRANSFORMERS, lookup)
    })

    expect(outline(editor)).toEqual([
      "paragraph:Before ",
      "block:notes",
      "paragraph:after"
    ])
  })

  it("replaces an empty line instead of leaving blank paragraphs around it", () => {
    const editor = editorWith("Intro")
    run(editor, () => {
      const line = $createParagraphNode()
      $getRoot().append(line)
      line.select()
      $insertBlocksAt(block("notes"), MARKDOWN_TRANSFORMERS, lookup)
    })

    expect(outline(editor)).toEqual([
      "paragraph:Intro",
      "block:notes",
      "paragraph:"
    ])
  })

  it("inserts after the current block when the caret is inside one", () => {
    const editor = editorWith(
      [
        '<block type="notes">\n\n## Notes\n\nSome text\n\n</block>',
        "Tail"
      ].join("\n\n")
    )
    run(editor, () => {
      $caretAfter("Some")
      $insertBlocksAt(
        block("acceptance-criteria"),
        MARKDOWN_TRANSFORMERS,
        lookup
      )
    })

    expect(outline(editor)).toEqual([
      "block:notes",
      "block:acceptance-criteria",
      "paragraph:Tail"
    ])
  })

  it("puts the caret on the first hinted line", () => {
    const editor = editorWith("Start")
    run(editor, () => {
      $caretAfter("Start")
      $insertBlocksAt(
        block("expected-vs-actual"),
        MARKDOWN_TRANSFORMERS,
        lookup
      )
    })

    expect(caret(editor)).toEqual({
      text: "Expected:",
      type: "paragraph",
      block: "expected-vs-actual"
    })
  })

  it("recreates a hint-only line that markdown dropped and puts the caret there", () => {
    const editor = editorWith("Start")
    run(editor, () => {
      $caretAfter("Start")
      $insertBlocksAt(block("context"), MARKDOWN_TRANSFORMERS, lookup)
    })

    expect(caret(editor)).toEqual({
      text: "",
      type: "paragraph",
      block: "context"
    })
  })

  it("lands on the first empty list item of a numbered list", () => {
    const editor = editorWith("Start")
    run(editor, () => {
      $caretAfter("Start")
      $insertBlocksAt(
        block("steps-to-reproduce"),
        MARKDOWN_TRANSFORMERS,
        lookup
      )
    })

    expect(caret(editor)).toMatchObject({
      type: "listitem",
      block: "steps-to-reproduce"
    })
  })

  it("is undone in one step, back to the typed query", async () => {
    const editor = editorWith("Before after")
    run(editor, () => {
      $caretAfter("Before ")
      const selection = $getSelection()
      if ($isRangeSelection(selection)) selection.insertText("/notes")
    })
    const typed = markdown(editor)
    run(editor, () => {
      const node = $getRoot()
        .getAllTextNodes()
        .find((candidate) => candidate.getTextContent().includes("/notes"))
      if (node === undefined) throw new Error("no query")
      const start = node.getTextContent().indexOf("/notes")
      const [, query] = node.splitText(start, start + "/notes".length)
      query.select(query.getTextContentSize(), query.getTextContentSize())
      query.remove()
      $insertBlocksAt(block("notes"), MARKDOWN_TRANSFORMERS, lookup)
    })
    expect(outline(editor)).toContain("block:notes")

    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await Promise.resolve()

    expect(typed).toBe("Before /notesafter")
    expect(markdown(editor)).toBe(typed)
  })
})
