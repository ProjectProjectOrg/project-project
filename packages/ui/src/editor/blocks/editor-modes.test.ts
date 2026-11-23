// @vitest-environment jsdom
import { buildEditorFromExtensions } from "@lexical/extension"
import {
  $convertFromMarkdownString,
  $convertToMarkdownString
} from "@lexical/mdast"
import { formatTicketBlock, stripHints } from "@pp/shared"
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  configExtension,
  defineExtension,
  type LexicalEditor
} from "lexical"
import { describe, expect, it } from "vitest"

import { $isHintNode } from "../../editor/hint-node"
import { MarkdownExtension } from "../markdown-extension"
import { HintExtension, registerNoNestedBlocks } from "./definition-mode"
import { $isSyncedBlockNode, SyncedBlockNode } from "./synced-block-node"
import { $detachSyncedBlock } from "./synced-blocks"
import { $revertToReference } from "./template-blocks"
import { TicketBlockMarkdownExtension } from "./ticket-block-markdown"
import {
  $createTicketBlockNode,
  $isTicketBlockNode,
  TicketBlockNode
} from "./ticket-block-node"

const CONTEXT = "## Context\n\n{{Why this ticket exists}}"

function makeEditor(mode: "template" | "definition") {
  return buildEditorFromExtensions(
    defineExtension({
      name: "editor-modes-test",
      nodes: [TicketBlockNode, SyncedBlockNode],
      dependencies: [
        MarkdownExtension,
        mode === "definition"
          ? HintExtension
          : configExtension(TicketBlockMarkdownExtension, {
              emptyAsReference: true
            })
      ],
      onError: (error) => {
        throw error
      }
    })
  )
}

const load = (editor: LexicalEditor, markdown: string) =>
  editor.update(() => $convertFromMarkdownString(markdown), { discrete: true })

const exported = (editor: LexicalEditor) =>
  editor.read(() => $convertToMarkdownString())

const kinds = (editor: LexicalEditor) =>
  editor.read(() =>
    $getRoot()
      .getChildren()
      .map((node) =>
        $isSyncedBlockNode(node) ? node.getMode() : node.getType()
      )
  )

describe("template mode", () => {
  const body = `Intro line.\n\n${formatTicketBlock("context", "")}`

  it("imports references and keeps loose markdown", () => {
    const editor = makeEditor("template")
    load(editor, body)
    expect(kinds(editor)).toEqual(["paragraph", "reference"])
    expect(exported(editor)).toBe(body)
  })

  it("customizes a reference into a copy and reverts it to the reference", () => {
    const editor = makeEditor("template")
    load(editor, body)
    editor.update(
      () => {
        const reference = $getRoot().getChildren().find($isSyncedBlockNode)!
        $detachSyncedBlock(reference, stripHints(CONTEXT))
      },
      { discrete: true }
    )
    expect(kinds(editor)).toEqual(["paragraph", "ticket-block"])
    expect(exported(editor)).toBe(
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
    expect(exported(editor)).toBe(body)
  })
})

describe("definition mode", () => {
  it("round-trips hints as hint nodes", () => {
    const editor = makeEditor("definition")
    load(editor, CONTEXT)
    const hints = editor.read(() =>
      $getRoot()
        .getAllTextNodes()
        .filter($isHintNode)
        .map((node) => node.getTextContent())
    )
    expect(hints).toEqual(["{{Why this ticket exists}}"])
    expect(exported(editor)).toBe(CONTEXT)
  })

  it("never creates block nodes from markdown", () => {
    const editor = makeEditor("definition")
    load(editor, formatTicketBlock("notes", "Nested"))
    expect(kinds(editor)).not.toContain("ticket-block")
  })

  it("unwraps a block node that gets in anyway", () => {
    const editor = makeEditor("definition")
    const unregister = registerNoNestedBlocks(editor)
    editor.update(
      () => {
        const block = $createTicketBlockNode("notes")
        block.append(
          $createParagraphNode().append($createTextNode("Nested text"))
        )
        $getRoot().clear().append(block)
      },
      { discrete: true }
    )
    expect(kinds(editor)).toEqual(["paragraph"])
    expect(exported(editor)).toBe("Nested text")
    unregister()
  })
})
