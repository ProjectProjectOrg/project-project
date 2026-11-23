import type { Element, ElementContent, Root, RootContent } from "hast"

import { highlightCode, type CodeToken } from "../lib/highlight"

const textOf: (node: ElementContent) => string = (node) => {
  if (node.type === "text") return node.value
  if (node.type === "element") return node.children.map(textOf).join("")
  return ""
}

const classesOf = (node: Element) => {
  const { className } = node.properties
  return Array.isArray(className) ? className.map(String) : []
}

const languageOf = (code: Element) =>
  classesOf(code)
    .find((name) => name.startsWith("language-"))
    ?.slice("language-".length)

const plainLines = (text: string) =>
  text.split("\n").map((line) => {
    const tokens: Array<CodeToken> =
      line === "" ? [] : [{ text: line, kind: null }]
    return tokens
  })

const tokenNode: (token: CodeToken) => ElementContent = ({ text, kind }) =>
  kind === null
    ? { type: "text", value: text }
    : {
        type: "element",
        tagName: "span",
        properties: { className: ["token", kind] },
        children: [{ type: "text", value: text }]
      }

const highlight = (pre: Element, code: Element) => {
  const text = code.children.map(textOf).join("")
  const language = languageOf(code)
  const highlighted =
    language === undefined ? null : highlightCode(text, language)
  if (highlighted !== null)
    pre.properties.className = [...classesOf(pre), `language-${language}`]
  const tokens = highlighted ?? plainLines(text)
  const lines = tokens.map((line, index) =>
    index < tokens.length - 1 ? line.concat({ text: "\n", kind: null }) : line
  )
  if (lines.at(-1)?.every((token) => token.text.trim() === "")) lines.pop()
  code.properties.className = [...classesOf(code), "code-highlight"]
  code.children = lines.map((line, index) => ({
    type: "element",
    tagName: "span",
    properties: { className: ["code-line", "line-number"], line: index + 1 },
    children: line.map(tokenNode)
  }))
}

const visit = (node: Root | RootContent) => {
  if (node.type !== "root" && node.type !== "element") return
  if (node.type === "element" && node.tagName === "pre") {
    const code = node.children.find(
      (child): child is Element =>
        child.type === "element" && child.tagName === "code"
    )
    if (code !== undefined) return highlight(node, code)
  }
  node.children.forEach(visit)
}

export const rehypeHighlight = () => (tree: Root) => visit(tree)
