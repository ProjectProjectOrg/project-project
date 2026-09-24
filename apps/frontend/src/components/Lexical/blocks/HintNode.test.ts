import { ListItemNode, ListNode } from "@lexical/list"
import {
  $convertFromMarkdownString,
  $convertToMarkdownString
} from "@lexical/markdown"
import { HeadingNode, QuoteNode } from "@lexical/rich-text"
import { $getRoot, createEditor } from "lexical"
import { describe, expect, it } from "vitest"

import { MARKDOWN_TRANSFORMERS } from "../../LexicalEditor"
import { $isHintNode, HINT_TRANSFORMER, HintNode } from "./HintNode"

const TRANSFORMERS = [HINT_TRANSFORMER, ...MARKDOWN_TRANSFORMERS]

function importDefinition(markdown: string) {
  const editor = createEditor({
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode, HintNode],
    onError: (error) => {
      throw error
    }
  })
  let exported = ""
  let hints: ReadonlyArray<string> = []
  editor.update(
    () => {
      $convertFromMarkdownString(markdown, TRANSFORMERS)
      hints = $getRoot()
        .getAllTextNodes()
        .filter($isHintNode)
        .map((node) => node.getTextContent())
      exported = $convertToMarkdownString(TRANSFORMERS)
    },
    { discrete: true }
  )
  return { exported, hints }
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
