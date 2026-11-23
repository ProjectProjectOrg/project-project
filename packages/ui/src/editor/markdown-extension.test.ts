// @vitest-environment jsdom
import { buildEditorFromExtensions } from "@lexical/extension"
import {
  $convertFromMarkdownString,
  $convertToMarkdownString
} from "@lexical/mdast"
import { $isTableNode } from "@lexical/table"
import { $getRoot, defineExtension } from "lexical"
import { expect, it } from "vitest"

import { MarkdownExtension } from "./markdown-extension"

const createEditor = () =>
  buildEditorFromExtensions(
    defineExtension({
      name: "markdown-extension-test",
      dependencies: [MarkdownExtension],
      onError: (error) => {
        throw error
      }
    })
  )

it("imports editable cells and preserves a GFM table through export", () => {
  const editor = createEditor()
  editor.update(
    () => {
      $convertFromMarkdownString(
        "| Name | Value |\n| --- | ---: |\n| **One** | Two |"
      )
      const table = $getRoot().getFirstChild()
      expect($isTableNode(table)).toBe(true)
      expect($convertToMarkdownString()).toBe(
        "| Name    | Value |\n| ------- | ----: |\n| **One** |   Two |"
      )
    },
    { discrete: true }
  )
})

it.each([
  [
    "Name | Value\n:--- | :---:\nOne | Two",
    "| Name | Value |\n| :--- | :---: |\n| One  |  Two  |"
  ],
  [
    "| Name | Value |\n| --- | --- |\n| a\\|b | `c\\|d` |",
    "| Name | Value  |\n| ---- | ------ |\n| a\\|b | `c\\|d` |"
  ],
  [
    "| Name | Value |\n| --- | --- |\n| One |\n| | Two |",
    "| Name | Value |\n| ---- | ----- |\n| One  |       |\n|      | Two   |"
  ],
  [
    "Before\n\n| Name | Value |\n| --- | --- |\n| One | Two |\n\nAfter",
    "Before\n\n| Name | Value |\n| ---- | ----- |\n| One  | Two   |\n\nAfter"
  ],
  ["| Name | Value |\n| --- | --- |", "| Name | Value |\n| ---- | ----- |"],
  [
    "| Link | Value |\n| --- | --- |\n| [Docs](https://example.com) | ~~old~~ |",
    "| Link                        | Value   |\n| --------------------------- | ------- |\n| [Docs](https://example.com) | ~~old~~ |"
  ]
])("round-trips table syntax: %s", (input, expected) => {
  const editor = createEditor()
  editor.update(
    () => {
      $convertFromMarkdownString(input)
      expect($convertToMarkdownString()).toBe(expected)
      $convertFromMarkdownString(expected)
      expect($convertToMarkdownString()).toBe(expected)
    },
    { discrete: true }
  )
})

it("leaves pipe text and malformed table delimiters as paragraphs", () => {
  const editor = createEditor()
  editor.update(
    () => {
      $convertFromMarkdownString("a | b\nnot | a delimiter")
      expect($getRoot().getFirstChild()?.getType()).toBe("paragraph")
      expect($convertToMarkdownString()).toBe("a | b\nnot | a delimiter")
    },
    { discrete: true }
  )
})

it("preserves backslashes next to pipes in inline code across repeated saves", () => {
  const editor = createEditor()
  const input =
    "| Code | Value |\n| --- | --- |\n" +
    String.raw`| \`a\\\|b\` | kept |`.replace(/\\`/g, "`")
  editor.update(
    () => {
      const saved =
        "| Code     | Value |\n| -------- | ----- |\n" +
        String.raw`| \`a\\\|b\` | kept  |`.replace(/\\`/g, "`")
      $convertFromMarkdownString(input)
      expect($convertToMarkdownString()).toBe(saved)
      $convertFromMarkdownString(saved)
      expect($convertToMarkdownString()).toBe(saved)
    },
    { discrete: true }
  )
})

it.each([
  String.raw`| \`foo\` | kept |`.replace(/\\`/g, "\\`"),
  "| ``a`b`` | kept |"
])(
  "does not interpret escaped or multi-backtick code delimiters during repeated saves: %s",
  (row) => {
    const editor = createEditor()
    editor.update(
      () => {
        $convertFromMarkdownString("| Code | Value |\n| --- | --- |\n" + row)
        const content = $getRoot().getTextContent()
        const saved = $convertToMarkdownString()
        $convertFromMarkdownString(saved)
        expect($getRoot().getTextContent()).toBe(content)
        expect($convertToMarkdownString()).toBe(saved)
      },
      { discrete: true }
    )
  }
)
