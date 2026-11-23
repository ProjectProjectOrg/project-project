// @vitest-environment jsdom
import { buildEditorFromExtensions } from "@lexical/extension"
import {
  $convertFromMarkdownString,
  $convertToMarkdownString
} from "@lexical/mdast"
import { $getRoot, defineExtension } from "lexical"
import { describe, expect, it } from "vitest"

import { HintExtension } from "./blocks/definition-mode"
import { $isHintNode } from "./hint-node"
import { MarkdownExtension } from "./markdown-extension"

function importDefinition(markdown: string) {
  const editor = buildEditorFromExtensions(
    defineExtension({
      name: "hint-node-test",
      dependencies: [MarkdownExtension, HintExtension],
      onError: (error) => {
        throw error
      }
    })
  )
  editor.update(() => $convertFromMarkdownString(markdown), { discrete: true })
  return editor.read(() => ({
    exported: $convertToMarkdownString(),
    hints: $getRoot()
      .getAllTextNodes()
      .filter($isHintNode)
      .map((node) => node.getTextContent())
  }))
}

describe("HintNode", () => {
  it("round-trips trailing hints on paragraphs and list items", () => {
    const markdown = [
      "## Steps to reproduce",
      "",
      "1. {{Where you start}}",
      "2. {{What you do}}",
      "",
      "**Expected:** {{what should happen}}",
      "",
      "{{How often: always, sometimes, only when…}}"
    ].join("\n")
    const { exported, hints } = importDefinition(markdown)
    expect(exported).toBe(markdown)
    expect(hints).toEqual([
      "{{Where you start}}",
      "{{What you do}}",
      "{{what should happen}}",
      "{{How often: always, sometimes, only when…}}"
    ])
  })

  it("leaves a mid-line token as plain text", () => {
    const { exported, hints } = importDefinition("use {{x}} here")
    expect(hints).toEqual([])
    expect(exported).toBe("use {{x}} here")
  })
})
