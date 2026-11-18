import { $createCodeNode } from "@lexical/code"
import { $createHorizontalRuleNode } from "@lexical/extension"
import { $createLinkNode } from "@lexical/link"
import {
  $createListItemNode,
  $createListNode,
  $isListNode
} from "@lexical/list"
import { LINK, type Transformer } from "@lexical/markdown"
import { $createHeadingNode, $createQuoteNode } from "@lexical/rich-text"
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
  type ElementNode,
  type LexicalNode,
  type TextFormatType
} from "lexical"
import type { Nodes, ListItem } from "mdast"
import { toMarkdown } from "mdast-util-to-markdown"

import { HINT_TRANSFORMER } from "./hint-node"
import { $createImageNode } from "./image-node"
import { parseMarkdown } from "./markdown-parser"

// Markdown in: the parsed tree (mdast) as Lexical nodes, block by block and inline.

export function definitionsIn(nodes: ReadonlyArray<Nodes>) {
  const definitions = new Map<string, Extract<Nodes, { type: "definition" }>>()
  const visit = (node: Nodes) => {
    if (node.type === "definition" && !definitions.has(node.identifier))
      definitions.set(node.identifier, node)
    if ("children" in node) node.children.forEach(visit)
  }
  nodes.forEach(visit)
  return definitions
}

export type ImportContext = Readonly<{
  source: string
  lines: ReadonlyArray<string>
  transformers: ReadonlyArray<Transformer>
  definitions: ReadonlyMap<string, Extract<Nodes, { type: "definition" }>>
}>

export function appendBlocks(
  parent: ElementNode,
  nodes: ReadonlyArray<Nodes>,
  context: ImportContext
) {
  for (const node of nodes) {
    if (node.type === "html" && node.position !== undefined) {
      const startLineIndex = node.position.start.line - 1
      const line = context.lines[startLineIndex]
      let consumedLine = 0
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
      if (handled) {
        const remaining = context.lines
          .slice(consumedLine, nodes.at(-1)?.position?.end.line)
          .join("\n")
        const definitions = [...context.definitions.values()]
          .map((definition) => toMarkdown(definition))
          .join("\n")
        const source = `${definitions}\n\n${remaining}`
        const tree = parseMarkdown(source)
        appendBlocks(parent, tree.children, {
          ...context,
          source,
          lines: source.split("\n"),
          definitions: definitionsIn(tree.children)
        })
        return
      }
    }
    parent.append(...importNode(node, context))
  }
}

export const inlineNodes: (
  nodes: ReadonlyArray<Nodes>,
  context: ImportContext,
  formats?: ReadonlyArray<TextFormatType>
) => ReadonlyArray<LexicalNode> = (nodes, context, formats = []) =>
  nodes.flatMap((node) => {
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
      for (const format of new Set(formats)) text.toggleFormat(format)
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

export function sourceOf(node: Nodes, context: ImportContext) {
  return node.position === undefined
    ? ""
    : context.source.slice(node.position.start.offset, node.position.end.offset)
}

export function taskChecked(item: ListItem, context: ImportContext) {
  if (item.checked !== null && item.checked !== undefined) return item.checked
  const marker = /^[-*+]\s+\[([ xX])\][ \t]+$/.exec(sourceOf(item, context))
  return marker === null ? null : marker[1].toLowerCase() === "x"
}

export function importNode(node: Nodes, context: ImportContext) {
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
