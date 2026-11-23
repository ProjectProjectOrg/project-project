// @vitest-environment jsdom
import { buildEditorFromExtensions } from "@lexical/extension"
import { HistoryExtension } from "@lexical/history"
import { $isListNode, ListExtension } from "@lexical/list"
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  MdastShortcutsExtension
} from "@lexical/mdast"
import { RichTextExtension } from "@lexical/rich-text"
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  defineExtension,
  type LexicalEditor
} from "lexical"
import { describe, expect, it } from "vitest"

import { ChecklistShortcutExtension } from "../editor/checklist-markdown"
import { TicketBlockExtension } from "./blocks/ticket-block-extension"
import { TicketBlockMarkdownExtension } from "./blocks/ticket-block-markdown"
import { MarkdownExtension } from "./markdown-extension"

function editorWith(markdown: string) {
  const editor = buildEditorFromExtensions(
    defineExtension({
      name: "checklist-shortcut-test",
      dependencies: [
        RichTextExtension,
        HistoryExtension,
        ListExtension,
        MarkdownExtension,
        ChecklistShortcutExtension,
        MdastShortcutsExtension,
        TicketBlockExtension,
        TicketBlockMarkdownExtension
      ],
      $initialEditorState: () => {
        $convertFromMarkdownString(markdown)
      },
      onError: (error) => {
        throw error
      }
    })
  )
  editor.update(() => {}, { discrete: true })
  return editor
}

function typeInto(editor: LexicalEditor, itemText: string, typed: string) {
  editor.update(
    () => {
      const text = $getRoot()
        .getAllTextNodes()
        .find((node) => node.getTextContent() === itemText)
      if (text === undefined) throw new Error(`no text ${itemText}`)
      text.select(itemText.length, itemText.length)
    },
    { discrete: true }
  )
  for (const char of typed) {
    editor.update(
      () => {
        const selection = $getSelection()
        if ($isRangeSelection(selection)) selection.insertText(char)
      },
      { discrete: true }
    )
  }
  editor.update(() => {}, { discrete: true })
}

const markdownOf = (editor: LexicalEditor) =>
  editor.read(() => $convertToMarkdownString())

const listTypes = (editor: LexicalEditor) =>
  editor.read(() =>
    $getRoot()
      .getChildren()
      .filter($isListNode)
      .map((list) => list.getListType())
  )

describe("typing a task marker into a bullet", () => {
  it("turns a lone bullet into an unchecked task", () => {
    const editor = editorWith("- x")
    editor.update(
      () => {
        $getRoot().getAllTextNodes()[0].setTextContent("[ ]")
      },
      { discrete: true }
    )
    typeInto(editor, "[ ]", " ")
    expect(listTypes(editor)).toEqual(["check"])
    expect(markdownOf(editor)).toBe("- [ ] ")
  })

  it("keeps typing inside the new task", () => {
    const editor = editorWith("- x")
    editor.update(
      () => {
        $getRoot().getAllTextNodes()[0].setTextContent("[x]")
      },
      { discrete: true }
    )
    typeInto(editor, "[x]", " done")
    expect(markdownOf(editor)).toBe("- [x] done")
  })

  it("splits a bullet list around the converted item", () => {
    const editor = editorWith("- one\n- [ ]\n- three")
    typeInto(editor, "[ ]", " two")
    expect(listTypes(editor)).toEqual(["bullet", "check", "bullet"])
    expect(markdownOf(editor)).toBe("- one\n- [ ] two\n- three")
  })

  it("keeps an item's nested list with it", () => {
    const editor = editorWith("- [ ]\n    - child\n- b")
    typeInto(editor, "[ ]", " a")
    expect(listTypes(editor)).toEqual(["check", "bullet"])
    expect(
      editor.read(() =>
        $getRoot().getChildren().filter($isListNode)[0].getTextContent()
      )
    ).toContain("child")
    expect(markdownOf(editor)).toBe("- [ ] a\n  - child\n- b")
  })

  it("joins a checklist right above", () => {
    const editor = editorWith("- [ ] one\n\n- [ ]")
    expect(listTypes(editor)).toEqual(["check", "bullet"])
    typeInto(editor, "[ ]", " two")
    expect(listTypes(editor)).toEqual(["check"])
    expect(markdownOf(editor)).toBe("- [ ] one\n- [ ] two")
  })

  it("works inside a ticket block", () => {
    const editor = editorWith(
      '<block type="notes">\n\n## Notes\n\n- [ ]\n\n</block>'
    )
    typeInto(editor, "[ ]", " a")
    expect(markdownOf(editor).trimEnd()).toBe(
      '<block type="notes">\n\n## Notes\n\n- [ ] a\n\n</block>'
    )
  })

  it("leaves a marker typed mid-text alone", () => {
    const editor = editorWith("- see [ ]")
    typeInto(editor, "see [ ]", " x")
    expect(listTypes(editor)).toEqual(["bullet"])
  })
})
