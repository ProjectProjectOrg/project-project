// @vitest-environment jsdom
import {
  $createCodeNode,
  $isCodeHighlightNode,
  $isCodeNode
} from "@lexical/code-core"
import { buildEditorFromExtensions } from "@lexical/extension"
import { RichTextExtension } from "@lexical/rich-text"
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $createLineBreakNode,
  $isRangeSelection,
  $isTextNode,
  COMPOSITION_END_COMMAND,
  COMPOSITION_START_COMMAND,
  defineExtension
} from "lexical"
import { expect, it } from "vitest"

import { loadHighlighter } from "../lib/highlight"
import { CodeHighlightExtension } from "./code-highlight"

it("highlights a code block and keeps the caret where the typing was", async () => {
  const editor = buildEditorFromExtensions(
    defineExtension({
      name: "test",
      dependencies: [RichTextExtension, CodeHighlightExtension]
    })
  )
  editor.update(
    () => {
      const code = $createCodeNode("typescript")
      $getRoot().clear().append(code)
      code.append($createTextNode("const x = 1")).selectEnd()
    },
    { discrete: true }
  )
  editor.update(
    () => {
      const selection = $getSelection()
      if ($isRangeSelection(selection)) selection.insertText("2")
    },
    { discrete: true }
  )
  await loadHighlighter()
  editor.read(() => {
    const code = $getRoot().getFirstChild()
    if (!$isCodeNode(code)) throw new Error("no code block")
    expect(
      code
        .getChildren()
        .map((node) =>
          $isCodeHighlightNode(node)
            ? [node.getTextContent(), node.getHighlightType() ?? null]
            : null
        )
    ).toEqual([
      ["const ", "keyword"],
      ["x ", null],
      ["= ", "punctuation"],
      ["12", "number"]
    ])
    const selection = $getSelection()
    if (!$isRangeSelection(selection)) throw new Error("no selection")
    expect(selection.anchor.getNode().getTextContent()).toBe("12")
    expect(selection.anchor.offset).toBe(2)
  })
})

it("leaves an IME composition in a code block alone until it ends", async () => {
  await loadHighlighter()
  const editor = buildEditorFromExtensions(
    defineExtension({
      name: "test",
      dependencies: [RichTextExtension, CodeHighlightExtension]
    })
  )
  editor.update(
    () => {
      const code = $createCodeNode("typescript")
      $getRoot().clear().append(code)
      code.append($createTextNode("const x = 1"), $createLineBreakNode())
    },
    { discrete: true }
  )
  editor.update(() => $getRoot().selectEnd(), { discrete: true })
  editor.dispatchCommand(
    COMPOSITION_START_COMMAND,
    new CompositionEvent("compositionstart")
  )
  const highlighted = () =>
    editor.read(() => {
      const code = $getRoot().getFirstChild()
      if (!$isCodeNode(code)) throw new Error("no code block")
      return code
        .getChildren()
        .every((node) => !$isTextNode(node) || $isCodeHighlightNode(node))
    })
  expect(editor.isComposing()).toBe(true)
  expect(highlighted()).toBe(false)
  editor.dispatchCommand(
    COMPOSITION_END_COMMAND,
    new CompositionEvent("compositionend", { data: "" })
  )
  expect(highlighted()).toBe(true)
})

it("keeps the caret on an empty last line when the language changes", () => {
  const editor = buildEditorFromExtensions(
    defineExtension({
      name: "test",
      dependencies: [RichTextExtension, CodeHighlightExtension]
    })
  )
  editor.update(
    () => {
      const code = $createCodeNode("plain")
      $getRoot().clear().append(code)
      code.append($createTextNode("const x = 1"), $createLineBreakNode())
      code.select(2, 2)
    },
    { discrete: true }
  )
  editor.update(
    () => {
      const code = $getRoot().getFirstChild()
      if ($isCodeNode(code)) code.setLanguage("typescript")
    },
    { discrete: true }
  )
  editor.update(
    () => {
      const selection = $getSelection()
      if ($isRangeSelection(selection)) selection.insertText("y")
    },
    { discrete: true }
  )
  editor.read(() => {
    expect($getRoot().getTextContent()).toBe("const x = 1\ny")
  })
})
