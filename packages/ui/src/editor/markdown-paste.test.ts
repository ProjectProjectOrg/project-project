// @vitest-environment jsdom
import { $createCodeNode } from "@lexical/code-core"
import { buildEditorFromExtensions } from "@lexical/extension"
import { createEmptyHistoryState, registerHistory } from "@lexical/history"
import {
  $convertFromMarkdownString,
  $convertToMarkdownString
} from "@lexical/mdast"
import { RichTextExtension } from "@lexical/rich-text"
import * as Match from "effect/Match"
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $nodesOfType,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  defineExtension,
  PASTE_COMMAND,
  SELECTION_INSERT_CLIPBOARD_NODES_COMMAND,
  UNDO_COMMAND,
  type LexicalEditor
} from "lexical"
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  onTestFinished,
  vi
} from "vitest"

import { registerMarkdownPaste } from "../editor/markdown-paste"
import { AttachmentExtension } from "./attachments/attachment-extension"
import { AttachmentNode } from "./attachments/attachment-node"
import { MarkdownExtension } from "./markdown-extension"
import { MentionExtension } from "./mentions/mention-extension"

beforeAll(() => {
  vi.stubGlobal("ClipboardEvent", class ClipboardEvent extends Event {})
  vi.stubGlobal("DragEvent", class DragEvent extends Event {})
})
afterAll(() => vi.unstubAllGlobals())

function pasteEvent(text: string, html = "", files: File[] = []) {
  const event = new ClipboardEvent("paste", { cancelable: true })
  Object.defineProperty(event, "clipboardData", {
    value: {
      files,
      types: ["text/plain", ...(html ? ["text/html"] : [])],
      getData: (type: string) =>
        Match.value(type).pipe(
          Match.when("text/plain", () => text),
          Match.when("text/html", () => html),
          Match.orElse(() => "")
        )
    }
  })
  return event
}

function createPasteEditor(text = "", code = false) {
  const editor = buildEditorFromExtensions(
    defineExtension({
      name: "markdown-paste-test",
      dependencies: [
        RichTextExtension,
        MarkdownExtension,
        MentionExtension,
        AttachmentExtension
      ],
      onError: (error) => {
        throw error
      }
    })
  )
  onTestFinished(registerMarkdownPaste(editor))
  onTestFinished(registerHistory(editor, createEmptyHistoryState(), 1000))
  editor.update(
    () => {
      const block = code ? $createCodeNode() : $createParagraphNode()
      $getRoot()
        .clear()
        .append(block.append($createTextNode(text)))
        .selectEnd()
    },
    { discrete: true }
  )
  return editor
}

function paste(editor: LexicalEditor, event: ClipboardEvent) {
  editor.update(
    () => {
      editor.dispatchCommand(PASTE_COMMAND, event)
    },
    { discrete: true }
  )
}

function markdown(editor: LexicalEditor) {
  return editor.read(() => $convertToMarkdownString())
}

describe("Markdown paste", () => {
  it("formats bold and replaces only the selection", () => {
    const editor = createPasteEditor("before replace after")
    editor.update(
      () => {
        $getRoot().getAllTextNodes()[0]?.select(7, 14)
      },
      { discrete: true }
    )
    paste(editor, pasteEvent("**bold**"))
    expect(markdown(editor)).toBe("before **bold** after")
  })

  it.each([
    "| Name | Value |\n| --- | ---: |\n| **One** | 2 |",
    "intro\n# Heading\nend",
    "hello\nworld",
    "- one\n  continuation\n- two",
    "> quote\ncontinuation",
    "```ts\nconst value = 1\n```",
    "**bold**\n\n![shot](/api/attachments/acme/01JBX7Q2K9ZWCVE8MTQ4RXPGHN)"
  ])("matches loaded Markdown structure for %s", (source) => {
    const pasted = createPasteEditor()
    paste(pasted, pasteEvent(source))
    const loaded = createPasteEditor()
    loaded.update(
      () => {
        $convertFromMarkdownString(source)
      },
      { discrete: true }
    )
    expect(pasted.getEditorState().toJSON()).toEqual(
      loaded.getEditorState().toJSON()
    )
    if (source.includes("/api/attachments/"))
      expect(pasted.read(() => $nodesOfType(AttachmentNode))).toHaveLength(1)
  })

  it("continues typing with the pasted text's formatting", () => {
    const editor = createPasteEditor("start ")
    paste(editor, pasteEvent("**bold**"))
    editor.update(
      () => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection))
          throw new Error("Expected range selection")
        selection.insertText("X")
      },
      { discrete: true }
    )
    expect(markdown(editor)).toBe("start **boldX**")
  })

  it("passes parsed nodes through Lexical's clipboard insertion command", () => {
    const editor = createPasteEditor()
    const inserted = vi.fn(() => false)
    onTestFinished(
      editor.registerCommand(
        SELECTION_INSERT_CLIPBOARD_NODES_COMMAND,
        inserted,
        COMMAND_PRIORITY_HIGH
      )
    )
    paste(editor, pasteEvent("**bold**"))
    expect(inserted).toHaveBeenCalledOnce()
  })

  it("uses HTML formatting when T3 supplies HTML alongside Markdown", () => {
    const editor = createPasteEditor()
    paste(
      editor,
      pasteEvent(
        "**bold**",
        '<meta charset="utf-8"><p><strong>bold</strong></p>'
      )
    )
    expect(markdown(editor)).toBe("**bold**")
  })

  it("keeps Markdown literal inside code blocks", () => {
    const editor = createPasteEditor("", true)
    paste(editor, pasteEvent("**bold**"))
    expect(editor.read(() => $getRoot().getTextContent())).toBe("**bold**")
    expect(
      editor.read(() =>
        $getRoot()
          .getAllTextNodes()
          .some((node) => node.hasFormat("bold"))
      )
    ).toBe(false)
  })

  it("leaves files to the attachment handler", () => {
    const editor = createPasteEditor()
    const attachmentHandler = vi.fn(() => true)
    onTestFinished(
      editor.registerCommand(
        PASTE_COMMAND,
        attachmentHandler,
        COMMAND_PRIORITY_LOW
      )
    )
    paste(editor, pasteEvent("**bold**", "", [new File([], "image.png")]))
    expect(attachmentHandler).toHaveBeenCalledOnce()
    expect(markdown(editor)).toBe("")
  })

  it("undoes the paste without removing preceding content", async () => {
    const editor = createPasteEditor("before ")
    paste(editor, pasteEvent("**bold**"))
    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await Promise.resolve()
    expect(markdown(editor)).toBe("before ")
  })
})
