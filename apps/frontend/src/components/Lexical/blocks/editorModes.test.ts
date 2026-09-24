import { CodeNode } from "@lexical/code"
import { LinkNode } from "@lexical/link"
import { ListItemNode, ListNode } from "@lexical/list"
import {
  $convertFromMarkdownString,
  $convertToMarkdownString
} from "@lexical/markdown"
import { HeadingNode, QuoteNode } from "@lexical/rich-text"
import { formatTicketBlock, stripHints } from "@pp/shared"
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  createEditor,
  type LexicalEditor
} from "lexical"
import { describe, expect, it } from "vitest"

import { transformersForMode } from "../../LexicalEditor"
import {
  $createTicketBlockNode,
  $isTicketBlockNode,
  TicketBlockNode
} from "../TicketBlockNode"
import { registerNoNestedBlocks } from "./definitionMode"
import { $isHintNode, HintNode } from "./HintNode"
import { $isSyncedBlockNode, SyncedBlockNode } from "./SyncedBlockNode"
import { $detachSyncedBlock } from "./syncedBlocks"
import { $revertToReference } from "./templateBlocks"

const TEMPLATE = transformersForMode("template", undefined)
const DEFINITION = transformersForMode("definition", undefined)

const CONTEXT = "## Context\n\n{{Why this ticket exists}}"

function makeEditor(): LexicalEditor {
  return createEditor({
    namespace: "editor-modes-test",
    nodes: [
      CodeNode,
      HeadingNode,
      QuoteNode,
      LinkNode,
      ListNode,
      ListItemNode,
      TicketBlockNode,
      SyncedBlockNode,
      HintNode
    ],
    onError: (error) => {
      throw error
    }
  })
}

const load = (
  editor: LexicalEditor,
  markdown: string,
  transformers: typeof TEMPLATE
) =>
  editor.update(() => $convertFromMarkdownString(markdown, transformers), {
    discrete: true
  })

const exported = (editor: LexicalEditor, transformers: typeof TEMPLATE) =>
  editor.getEditorState().read(() => $convertToMarkdownString(transformers))

const kinds = (editor: LexicalEditor) =>
  editor.getEditorState().read(() =>
    $getRoot()
      .getChildren()
      .map((node) =>
        $isSyncedBlockNode(node) ? node.getMode() : node.getType()
      )
  )

describe("template mode", () => {
  const body = `Intro line.\n\n${formatTicketBlock("context", "")}`

  it("imports references and keeps loose markdown", () => {
    const editor = makeEditor()
    load(editor, body, TEMPLATE)
    expect(kinds(editor)).toEqual(["paragraph", "reference"])
    expect(exported(editor, TEMPLATE)).toBe(body)
  })

  it("customizes a reference into a copy and reverts it to the reference", () => {
    const editor = makeEditor()
    load(editor, body, TEMPLATE)
    editor.update(
      () => {
        const reference = $getRoot().getChildren().find($isSyncedBlockNode)!
        $detachSyncedBlock(reference, stripHints(CONTEXT), TEMPLATE)
      },
      { discrete: true }
    )
    expect(kinds(editor)).toEqual(["paragraph", "ticket-block"])
    expect(exported(editor, TEMPLATE)).toBe(
      `Intro line.\n\n${formatTicketBlock("context", "## Context")}`
    )

    editor.update(
      () => {
        const copy = $getRoot().getChildren().find($isTicketBlockNode)!
        $revertToReference(copy)
      },
      { discrete: true }
    )
    expect(kinds(editor)).toEqual(["paragraph", "reference"])
    expect(exported(editor, TEMPLATE)).toBe(body)
  })
})

describe("definition mode", () => {
  it("round-trips hints as hint nodes", () => {
    const editor = makeEditor()
    load(editor, CONTEXT, DEFINITION)
    const hints = editor.getEditorState().read(() =>
      $getRoot()
        .getAllTextNodes()
        .filter($isHintNode)
        .map((node) => node.getTextContent())
    )
    expect(hints).toEqual(["{{Why this ticket exists}}"])
    expect(exported(editor, DEFINITION)).toBe(CONTEXT)
  })

  it("never creates block nodes from markdown", () => {
    const editor = makeEditor()
    load(editor, formatTicketBlock("notes", "Nested"), DEFINITION)
    expect(kinds(editor)).not.toContain("ticket-block")
  })

  it("unwraps a block node that gets in anyway", () => {
    const editor = makeEditor()
    const unregister = registerNoNestedBlocks(editor, DEFINITION)
    editor.update(
      () => {
        const block = $createTicketBlockNode("notes")
        block.append(
          $createParagraphNode().append($createTextNode("Nested text"))
        )
        $getRoot().append(block)
      },
      { discrete: true }
    )
    expect(kinds(editor)).toEqual(["paragraph"])
    expect(exported(editor, DEFINITION)).toBe("Nested text")
    unregister()
  })
})
