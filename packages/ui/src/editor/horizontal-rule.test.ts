// @vitest-environment jsdom
import { $createCodeNode, CodeNode } from "@lexical/code-core"
import { buildEditorFromExtensions } from "@lexical/extension"
import { RichTextExtension } from "@lexical/rich-text"
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  defineExtension,
  KEY_SPACE_COMMAND,
  type ElementNode,
  type TextNode
} from "lexical"
import { expect, it } from "vitest"

import { HorizontalRuleShortcutExtension } from "./horizontal-rule"

const pressSpaceAfterDashes = ($block: (text: TextNode) => ElementNode) => {
  const editor = buildEditorFromExtensions(
    defineExtension({
      name: "horizontal-rule-test",
      nodes: [CodeNode],
      dependencies: [RichTextExtension, HorizontalRuleShortcutExtension],
      onError: (error) => {
        throw error
      }
    })
  )
  editor.update(
    () => {
      const text = $createTextNode("---")
      $getRoot().clear().append($block(text), $createParagraphNode())
      text.select(3, 3)
    },
    { discrete: true }
  )
  const handled = editor.dispatchCommand(
    KEY_SPACE_COMMAND,
    new KeyboardEvent("keydown", { key: " " })
  )
  return {
    handled,
    blocks: editor.read(() =>
      $getRoot()
        .getChildren()
        .map((child) => child.getType())
    )
  }
}

it("turns a typed --- into a horizontal rule when space is pressed", () => {
  expect(
    pressSpaceAfterDashes((text) => $createParagraphNode().append(text)).blocks
  ).toEqual(["horizontalrule", "paragraph"])
})

it("leaves a --- line in a code block alone when space is pressed", () => {
  expect(
    pressSpaceAfterDashes((text) => $createCodeNode().append(text))
  ).toEqual({ handled: false, blocks: ["code", "paragraph"] })
})
