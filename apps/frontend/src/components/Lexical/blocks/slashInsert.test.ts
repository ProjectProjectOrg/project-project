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
import {
  BUILTIN_TEMPLATES,
  expandTemplate,
  formatTicketBlock,
  stripHints
} from "@pp/shared"
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
import {
  $applyTemplate,
  $insertBlocksAt,
  $selectFirstHint,
  missingBlocksMarkdown
} from "./blockCommands"

const lookup = lookupFor(BUILTIN_LIBRARY)

const block = (key: string): string => {
  const definition = lookup(key)
  if (definition === undefined) throw new Error(`no block ${key}`)
  return formatTicketBlock(key, stripHints(definition.content))
}

const chore = BUILTIN_TEMPLATES.find((template) => template.key === "chore")
if (chore === undefined) throw new Error("no chore template")

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

describe("$applyTemplate", () => {
  it("adds only the block types the body is missing, at the caret", () => {
    const existing = [
      "Intro",
      '<block type="acceptance-criteria">\n\n## Acceptance criteria\n\n- [x] Ticked\n\n</block>',
      "Tail"
    ].join("\n\n")
    const editor = editorWith(existing)
    let added: ReadonlyArray<string> = []
    run(editor, () => {
      $caretAfter("Intro")
      added = $applyTemplate(
        expandTemplate(chore, lookup),
        MARKDOWN_TRANSFORMERS,
        lookup
      )
    })

    expect(added).toEqual(["context"])
    expect(outline(editor)).toEqual([
      "paragraph:Intro",
      "block:context",
      "block:acceptance-criteria",
      "paragraph:Tail"
    ])
    expect(markdown(editor)).toContain("- [x] Ticked")
  })

  it("does nothing when every block is already there", () => {
    const editor = editorWith(
      [block("context"), block("acceptance-criteria"), "Tail"].join("\n\n")
    )
    const before = outline(editor)
    let added: ReadonlyArray<string> = ["unset"]
    run(editor, () => {
      $caretAfter("Tail")
      added = $applyTemplate(
        expandTemplate(chore, lookup),
        MARKDOWN_TRANSFORMERS,
        lookup
      )
    })

    expect(added).toEqual([])
    expect(outline(editor)).toEqual(before)
  })

  it("fills an empty body with the whole template", () => {
    const editor = editorWith("")
    run(editor, () => {
      $getRoot().selectEnd()
      $applyTemplate(
        expandTemplate(chore, lookup),
        MARKDOWN_TRANSFORMERS,
        lookup
      )
    })

    expect(
      outline(editor).filter((entry) => entry.startsWith("block:"))
    ).toEqual(["block:context", "block:acceptance-criteria"])
    expect(caret(editor)).toMatchObject({ block: "context" })
  })
})

describe("missingBlocksMarkdown", () => {
  it("keeps the added blocks in template order", () => {
    const expanded = [block("context"), block("notes"), block("risks")].join(
      "\n\n"
    )

    expect(missingBlocksMarkdown(expanded, ["context", "risks"])).toBe(
      [block("context"), block("risks")].join("\n\n")
    )
  })
})

describe("$selectFirstHint", () => {
  it("lands on the first hinted line of a freshly created ticket", () => {
    const editor = editorWith(
      [block("expected-vs-actual"), block("steps-to-reproduce")].join("\n\n")
    )
    let landed = false
    run(editor, () => {
      $getRoot().selectStart()
      landed = $selectFirstHint(lookup)
    })

    expect(landed).toBe(true)
    expect(caret(editor)).toEqual({
      text: "Expected:",
      type: "paragraph",
      block: "expected-vs-actual"
    })
  })

  it("leaves the caret alone when no block has a hint", () => {
    const editor = editorWith("Just text")
    let landed = true
    run(editor, () => {
      landed = $selectFirstHint(lookup)
    })
    expect(landed).toBe(false)
  })
})
