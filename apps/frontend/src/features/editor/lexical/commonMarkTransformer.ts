import { $createCodeNode } from "@lexical/code"
import { $createHorizontalRuleNode } from "@lexical/extension"
import { $createLinkNode } from "@lexical/link"
import {
  $createListItemNode,
  $createListNode,
  $isListItemNode,
  $isListNode,
  type ListNode
} from "@lexical/list"
import {
  $convertToMarkdownString,
  LINK,
  QUOTE,
  type MultilineElementTransformer,
  type TextMatchTransformer,
  type Transformer
} from "@lexical/markdown"
import {
  $createHeadingNode,
  $createQuoteNode,
  $isQuoteNode
} from "@lexical/rich-text"
import {
  $createTableCellNode,
  $createTableNode,
  $createTableRowNode,
  TableCellHeaderStates
} from "@lexical/table"
import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $isElementNode,
  $isLineBreakNode,
  $isTextNode,
  type ElementNode,
  type LexicalNode,
  type TextFormatType
} from "lexical"
import type { Nodes, ListItem } from "mdast"
import { toMarkdown } from "mdast-util-to-markdown"

import { parseMarkdown } from "../lib/markdownParser"
import { HINT_TRANSFORMER } from "./blocks/HintNode"
import { $createImageNode, ImageNode } from "./ImageNode"

export const INLINE_MARKDOWN_TRANSFORMER: TextMatchTransformer = {
  type: "text-match",
  dependencies: [],
  regExp: /(?<=^[^`]*)(`+)(?!`)([^\n]*?)\1(?!`)$/,
  trigger: "`",
  replace: (node, match) => {
    const paragraph = parseMarkdown(match[0]).children[0]
    if (paragraph?.type !== "paragraph" || paragraph.children.length !== 1)
      return undefined
    const code = paragraph.children[0]
    if (code.type !== "inlineCode") return undefined
    node.setTextContent(code.value)
    if (!node.hasFormat("code")) node.toggleFormat("code")
    return node
  },
  export: (node, _children, exportFormat) => {
    if ($isListNode(node)) return ""
    if ($isLineBreakNode(node)) return "  \n"
    if (node instanceof ImageNode)
      return toMarkdown({ type: "image", ...node.getImage() }).trimEnd()
    if (!$isTextNode(node)) return null
    if (!node.hasFormat("code"))
      return exportFormat(
        node,
        node
          .getTextContent()
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
      )
    return exportFormat(
      node,
      toMarkdown({ type: "inlineCode", value: node.getTextContent() }).trimEnd()
    )
  }
}

export function createCommonMarkTransformer(
  transformers: ReadonlyArray<Transformer>
): MultilineElementTransformer {
  return {
    type: "multiline-element",
    dependencies: [],
    regExpStart: /^/,
    replace: () => false,
    export: (node, traverseChildren) => {
      if ($isListNode(node) && hasListContinuation(node))
        return exportList(node, traverseChildren)
      if (!$isQuoteNode(node)) return null
      if (!node.getChildren().some($isElementNode))
        return QUOTE.export(node, traverseChildren)
      return $convertToMarkdownString([...transformers], node)
        .split("\n")
        .map((line) => (line === "" ? ">" : `> ${line}`))
        .join("\n")
    },
    handleImportAfterStartMatch: ({ lines, rootNode, startLineIndex }) => {
      const source = lines.slice(startLineIndex).join("\n")
      const tree = parseMarkdown(source)
      const definitions = new Map(
        tree.children.flatMap((node) =>
          node.type === "definition" ? [[node.identifier, node] as const] : []
        )
      )
      const context = {
        source,
        lines: source.split("\n"),
        transformers,
        definitions
      }
      appendBlocks(rootNode, tree.children, context)
      if (rootNode.isEmpty()) rootNode.append($createParagraphNode())
      return [true, lines.length - 1]
    }
  }
}

type ImportContext = Readonly<{
  source: string
  lines: ReadonlyArray<string>
  transformers: ReadonlyArray<Transformer>
  definitions: ReadonlyMap<string, Extract<Nodes, { type: "definition" }>>
}>

function appendBlocks(
  parent: ElementNode,
  nodes: ReadonlyArray<Nodes>,
  context: ImportContext
): void {
  let consumedLine = 0
  for (const node of nodes) {
    if ((node.position?.start.line ?? 0) <= consumedLine) continue
    if (node.type === "html" && node.position !== undefined) {
      const startLineIndex = node.position.start.line - 1
      const line = context.lines[startLineIndex]
      const handled = context.transformers.some((transformer) => {
        if (
          transformer.type !== "multiline-element" ||
          transformer.handleImportAfterStartMatch === undefined
        )
          return false
        const startMatch = line.match(transformer.regExpStart)
        if (startMatch === null) return false
        const result = transformer.handleImportAfterStartMatch({
          lines: [...context.lines],
          rootNode: parent,
          startLineIndex,
          startMatch,
          transformer
        })
        if (result?.[0] !== true) return false
        consumedLine = result[1] + 1
        return true
      })
      if (handled) continue
    }
    parent.append(...importNode(node, context))
  }
}

function inlineNodes(
  nodes: ReadonlyArray<Nodes>,
  context: ImportContext,
  formats: ReadonlyArray<TextFormatType> = []
): ReadonlyArray<LexicalNode> {
  return nodes.flatMap((node) => {
    switch (node.type) {
      case "strong":
        return inlineNodes(node.children, context, [...formats, "bold"])
      case "emphasis":
        return inlineNodes(node.children, context, [...formats, "italic"])
      case "delete":
        return inlineNodes(node.children, context, [
          ...formats,
          "strikethrough"
        ])
    }
    if (node.type === "text" || node.type === "inlineCode") {
      const text = $createTextNode(node.value)
      for (const format of formats) text.toggleFormat(format)
      if (node.type === "inlineCode") text.toggleFormat("code")
      if (node.type === "text") {
        for (const transformer of context.transformers) {
          if (transformer !== HINT_TRANSFORMER) continue
          const match = node.value.match(HINT_TRANSFORMER.regExp)
          if (match === null) continue
          const container = $createParagraphNode().append(text)
          const start = match.index ?? 0
          const matched =
            start === 0
              ? text.splitText(match[0].length)[0]
              : text.splitText(start, start + match[0].length)[1]
          HINT_TRANSFORMER.replace?.(matched, match)
          return container.getChildren()
        }
      }
      return [text]
    }
    if (node.type === "break") return [$createLineBreakNode()]
    if (
      node.type === "link" ||
      node.type === "image" ||
      node.type === "linkReference" ||
      node.type === "imageReference"
    ) {
      const reference =
        node.type === "linkReference" || node.type === "imageReference"
          ? context.definitions.get(node.identifier)
          : node
      if (reference === undefined)
        return [$createTextNode(sourceOf(node, context))]
      const raw = sourceOf(node, context)
      for (const transformer of context.transformers) {
        if (
          transformer.type !== "text-match" ||
          transformer === LINK ||
          transformer.importRegExp === undefined ||
          transformer.replace === undefined
        )
          continue
        const match = raw.match(transformer.importRegExp)
        if (match === null || match[0] !== raw) continue
        const text = $createTextNode(raw)
        const container = $createParagraphNode().append(text)
        transformer.replace(text, match)
        return container.getChildren()
      }
      if (node.type === "image" || node.type === "imageReference")
        return [
          $createImageNode({
            url: reference.url,
            alt: node.alt,
            title: reference.title
          })
        ]
      const link = $createLinkNode(reference.url, {
        title: reference.title ?? undefined
      })
      link.append(...inlineNodes(node.children, context, formats))
      return [link]
    }
    return [$createTextNode(sourceOf(node, context))]
  })
}

function sourceOf(node: Nodes, context: ImportContext): string {
  return node.position === undefined
    ? ""
    : context.source.slice(node.position.start.offset, node.position.end.offset)
}

function taskChecked(item: ListItem, context: ImportContext): boolean | null {
  if (item.checked !== null && item.checked !== undefined) return item.checked
  const marker = /^[-*+]\s+\[([ xX])\][ \t]+$/.exec(sourceOf(item, context))
  return marker === null ? null : marker[1].toLowerCase() === "x"
}

function exportList(
  list: ListNode,
  traverseChildren: (node: ElementNode) => string,
  depth = 0
): string {
  const output: string[] = []
  const indent = " ".repeat(depth * 4)
  let index = list.getStart()
  for (const item of list.getChildren()) {
    if (!$isListItemNode(item)) continue
    const first = item.getFirstChild()
    const content = traverseChildren(item)
    if ($isListNode(first)) {
      output.push(exportList(first, traverseChildren, depth + 1))
      if (content !== "")
        output.push(
          `\n${indent}    ${content.replace(/\n/g, `\n${indent}    `)}`
        )
      continue
    }
    const prefix =
      list.getListType() === "number"
        ? `${index++}. `
        : list.getListType() === "check"
          ? `- [${item.getChecked() ? "x" : " "}] `
          : "- "
    const escaped =
      list.getListType() === "check"
        ? content
        : content
            .replace(/^(\[[ xX]?\])(?=\s|$)/, "\\$1")
            .replace(/^(\s{0,3}\d+)(\.\s)/, "$1\\$2")
    output.push(indent + prefix + escaped)
  }
  return output.join("\n")
}

function hasListContinuation(list: ListNode): boolean {
  return list.getChildren().some((item) => {
    if (!$isListItemNode(item)) return false
    const first = item.getFirstChild()
    return (
      $isListNode(first) &&
      (item.getChildrenSize() > 1 || hasListContinuation(first))
    )
  })
}

function importNode(
  node: Nodes,
  context: ImportContext
): ReadonlyArray<LexicalNode> {
  switch (node.type) {
    case "paragraph": {
      const paragraph = $createParagraphNode().append(
        ...inlineNodes(node.children, context)
      )
      const trailing = sourceOf(node, context).match(/[ \t]+$/)?.[0]
      if (trailing !== undefined) paragraph.append($createTextNode(trailing))
      return [paragraph]
    }
    case "heading": {
      const tags = ["h1", "h2", "h3", "h4", "h5", "h6"] as const
      return [
        $createHeadingNode(tags[node.depth - 1]).append(
          ...inlineNodes(node.children, context)
        )
      ]
    }
    case "blockquote": {
      const quote = $createQuoteNode()
      appendBlocks(quote, node.children, context)
      return [quote]
    }
    case "list": {
      const lists: ReturnType<typeof $createListNode>[] = []
      for (const [index, item] of node.children.entries()) {
        const checked = taskChecked(item, context)
        const listType = node.ordered
          ? "number"
          : checked === null
            ? "bullet"
            : "check"
        let list = lists.at(-1)
        if (list?.getListType() !== listType) {
          list = $createListNode(listType, (node.start ?? 1) + index)
          lists.push(list)
        }
        let entry = $createListItemNode(checked ?? undefined)
        list.append(entry)
        for (const child of item.children) {
          if (child.type === "list") {
            entry = $createListItemNode().append(...importNode(child, context))
            list.append(entry)
          } else if (child.type === "paragraph") {
            if (!entry.isEmpty() && !$isListNode(entry.getLastChild()))
              entry.append($createLineBreakNode())
            if (
              item.checked == null &&
              checked !== null &&
              /^\[[ xX]\]$/.test(sourceOf(child, context).trim())
            )
              continue
            entry.append(...inlineNodes(child.children, context))
          } else entry.append(...importNode(child, context))
        }
      }
      return lists
    }
    case "code":
      return [
        $createCodeNode(node.lang ?? undefined).append(
          $createTextNode(node.value)
        )
      ]
    case "thematicBreak":
      return [$createHorizontalRuleNode()]
    case "table": {
      const table = $createTableNode()
      for (const [index, row] of node.children.entries()) {
        const tableRow = $createTableRowNode()
        for (const column of (node.children[0]?.children ?? []).keys()) {
          const cell = row.children[column]
          const tableCell = $createTableCellNode(
            index === 0
              ? TableCellHeaderStates.ROW
              : TableCellHeaderStates.NO_STATUS
          )
          tableCell.setFormat(node.align?.[column] ?? "")
          tableCell.append(
            $createParagraphNode().append(
              ...inlineNodes(cell?.children ?? [], context)
            )
          )
          tableRow.append(tableCell)
        }
        table.append(tableRow)
      }
      return [table]
    }
    case "definition":
      return []
    default:
      return [
        $createParagraphNode().append($createTextNode(sourceOf(node, context)))
      ]
  }
}
