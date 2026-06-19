import {
  $convertFromMarkdownString,
  $convertToMarkdownString
} from "@lexical/markdown"
import { CodeNode } from "@lexical/code"
import { HorizontalRuleNode } from "@lexical/extension"
import { LinkNode } from "@lexical/link"
import { ListItemNode, ListNode } from "@lexical/list"
import { HeadingNode, QuoteNode } from "@lexical/rich-text"
import { describe, expect, it } from "vitest"
import { createEditor } from "lexical"
import { MentionNode } from "./Lexical/MentionNode"
import {
  AUTO_LINK_MATCHERS,
  MARKDOWN_TRANSFORMERS,
  nextMarkdownChange
} from "./LexicalEditor"

function matchAutoLink(text: string) {
  for (const matcher of AUTO_LINK_MATCHERS) {
    const match = matcher(text)
    if (match) return match
  }
  return null
}

function roundTripMarkdown(markdown: string) {
  const editor = createEditor({
    namespace: "lexical-editor-test",
    nodes: [
      CodeNode,
      HeadingNode,
      HorizontalRuleNode,
      LinkNode,
      ListNode,
      ListItemNode,
      MentionNode,
      QuoteNode
    ],
    onError: (error) => {
      throw error
    }
  })

  let exported = ""

  editor.update(
    () => {
      $convertFromMarkdownString(markdown, MARKDOWN_TRANSFORMERS)
      exported = $convertToMarkdownString(MARKDOWN_TRANSFORMERS)
    },
    { discrete: true }
  )

  return exported
}

describe("nextMarkdownChange", () => {
  it("records the first content edit after initialization", () => {
    expect(nextMarkdownChange("", "pasted text")).toBe("pasted text")
  })

  it("ignores updates that serialize to the loaded markdown", () => {
    expect(nextMarkdownChange("unchanged", "unchanged")).toBeNull()
  })
})

describe("AUTO_LINK_MATCHERS", () => {
  it("matches absolute http URLs", () => {
    expect(matchAutoLink("https://example.com")).toMatchObject({
      text: "https://example.com",
      url: "https://example.com"
    })
  })

  it("normalizes www URLs", () => {
    expect(matchAutoLink("www.example.com")).toMatchObject({
      text: "www.example.com",
      url: "https://www.example.com"
    })
  })

  it("normalizes email addresses", () => {
    expect(matchAutoLink("hello@example.com")).toMatchObject({
      text: "hello@example.com",
      url: "mailto:hello@example.com"
    })
  })

  it("does not match mention URLs", () => {
    expect(matchAutoLink("mention:user/github_42")).toBeNull()
  })

  it("does not match bare domains without www", () => {
    expect(matchAutoLink("example.com")).toBeNull()
  })
})

describe("MARKDOWN_TRANSFORMERS", () => {
  it("round-trips markdown links", () => {
    expect(roundTripMarkdown("See [docs](https://example.com).")).toBe(
      "See [docs](https://example.com)."
    )
  })

  it("round-trips mention links as mentions", () => {
    expect(roundTripMarkdown("See [Wouter](mention:user/github_42).")).toBe(
      "See [Wouter](mention:user/github_42)."
    )
  })
})
