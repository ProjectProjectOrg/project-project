import type { Element, ElementContent } from "hast"

import type { CodeToken } from "../lib/highlight"

const textOf: (node: ElementContent) => string = (node) => {
  if (node.type === "text") return node.value
  if (node.type === "element") return node.children.map(textOf).join("")
  return ""
}

export const codeBlockOf = (pre: Element | undefined) => {
  const code = pre?.children.find(
    (child): child is Element =>
      child.type === "element" && child.tagName === "code"
  )
  if (code === undefined) return null
  const { className } = code.properties
  const classes = Array.isArray(className) ? className.map(String) : []
  const language = classes
    .find((name) => name.startsWith("language-"))
    ?.slice("language-".length)
  return { text: code.children.map(textOf).join(""), classes, language }
}

export const numberedCodeLines = (
  text: string,
  highlighted: ReadonlyArray<ReadonlyArray<CodeToken>> | null
) => {
  const tokens =
    highlighted ?? text.split("\n").map((text) => [{ text, kind: null }])
  const lines = tokens.map((line, index) =>
    index < tokens.length - 1 ? line.concat({ text: "\n", kind: null }) : line
  )
  if (lines.at(-1)?.every((token) => token.text.trim() === "")) lines.pop()
  return lines.map((line, index) => {
    let offset = 0
    return {
      number: index + 1,
      tokens: line.map((token) => {
        const key = offset
        offset += token.text.length
        return { ...token, offset: key }
      })
    }
  })
}
