import { createEmptyHistoryState, registerHistory } from "@lexical/history"
import { registerRichText } from "@lexical/rich-text"
import { LinkNode } from "@lexical/link"
import { HorizontalRuleNode } from "@lexical/extension"
import { CodeNode } from "@lexical/code"
import { HeadingNode, QuoteNode } from "@lexical/rich-text"
import { ListNode, ListItemNode } from "@lexical/list"
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $insertNodes,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  createEditor,
  PASTE_COMMAND,
  type LexicalEditor
} from "lexical"
import { afterAll, beforeAll, describe, expect, it, vi } from "vite-plus/test"
import { figmaSrc, parseFigmaUrl } from "@projectproject/shared"
import { MARKDOWN_TRANSFORMERS } from "../LexicalEditor"
import { MentionNode } from "./MentionNode"
import { AttachmentNode } from "./AttachmentNode"
import { ATTACHMENT_TRANSFORMER } from "./attachmentTransformer"
import { registerMarkdownPaste } from "./markdownPaste"
import { $createFigmaNode, $isFigmaNode, FigmaNode } from "./FigmaNode"

const URL_UNDER_TEST =
  "https://www.figma.com/design/iB7hYWogE88GCIikl1FckT/ProjectProject-?node-id=0-1&p=f&t=pgwi57wxwAdQKVm8-0"

beforeAll(() => {
  vi.stubGlobal("ClipboardEvent", class ClipboardEvent extends Event {})
})
afterAll(() => vi.unstubAllGlobals())

const transformers = [ATTACHMENT_TRANSFORMER, ...MARKDOWN_TRANSFORMERS]

function pasteEvent(text: string) {
  const event = new ClipboardEvent("paste", { cancelable: true })
  Object.defineProperty(event, "clipboardData", {
    value: {
      files: [],
      types: ["text/plain"],
      getData: (type: string) => (type === "text/plain" ? text : "")
    }
  })
  return event
}

function registerFigmaPaste(
  editor: LexicalEditor,
  priority: number = COMMAND_PRIORITY_LOW
) {
  return editor.registerCommand(
    PASTE_COMMAND,
    (event) => {
      if (!(event instanceof ClipboardEvent)) return false
      if (event.clipboardData?.files.length) return false
      const text = event.clipboardData?.getData("text/plain")?.trim()
      if (!text || /\s/.test(text)) return false
      const ref = parseFigmaUrl(text)
      if (ref === null) return false
      event.preventDefault()
      editor.update(() => {
        $insertNodes([
          $createFigmaNode({
            url: figmaSrc(text),
            label: text,
            ref,
            density: "compact"
          })
        ])
      })
      return true
    },
    priority
  )
}

function createPasteEditor(
  withMarkdownPaste: boolean,
  figmaPriority: number = COMMAND_PRIORITY_LOW
) {
  const editor = createEditor({
    nodes: [
      CodeNode,
      HeadingNode,
      QuoteNode,
      ListNode,
      ListItemNode,
      LinkNode,
      HorizontalRuleNode,
      MentionNode,
      AttachmentNode,
      FigmaNode
    ],
    onError: (error) => {
      throw error
    }
  })
  registerRichText(editor)
  if (withMarkdownPaste) registerMarkdownPaste(editor, transformers)
  registerFigmaPaste(editor, figmaPriority)
  registerHistory(editor, createEmptyHistoryState(), 1000)
  editor.update(
    () => {
      $getRoot()
        .append($createParagraphNode().append($createTextNode("")))
        .selectEnd()
    },
    { discrete: true }
  )
  return editor
}

function figmaNodeCount(editor: LexicalEditor) {
  return editor.getEditorState().read(() => {
    let count = 0
    const walk = (node: unknown) => {
      if ($isFigmaNode(node as never)) count++
      const children = (node as { getChildren?: () => unknown[] }).getChildren
      if (typeof children === "function") {
        for (const child of (node as { getChildren: () => unknown[] }).getChildren()) {
          walk(child)
        }
      }
    }
    walk($getRoot())
    return count
  })
}

describe("Figma bare-URL paste vs markdown paste", () => {
  it("creates a FigmaNode when only the Figma paste handler is registered", () => {
    const editor = createPasteEditor(false)
    editor.update(
      () => {
        editor.dispatchCommand(PASTE_COMMAND, pasteEvent(URL_UNDER_TEST))
      },
      { discrete: true }
    )
    expect(figmaNodeCount(editor)).toBe(1)
  })

  it("still creates a FigmaNode when markdown paste is also registered", () => {
    const editor = createPasteEditor(true)
    editor.update(
      () => {
        editor.dispatchCommand(PASTE_COMMAND, pasteEvent(URL_UNDER_TEST))
      },
      { discrete: true }
    )
    expect(figmaNodeCount(editor)).toBe(1)
  })

  it("works when the Figma handler outranks markdown paste (proposed fix)", () => {
    const editor = createPasteEditor(true, COMMAND_PRIORITY_HIGH)
    editor.update(
      () => {
        editor.dispatchCommand(PASTE_COMMAND, pasteEvent(URL_UNDER_TEST))
      },
      { discrete: true }
    )
    expect(figmaNodeCount(editor)).toBe(1)
  })
})
