import { $isAutoLinkNode, $isLinkNode } from "@lexical/link"
import { $isListItemNode, $isListNode, type ListNode } from "@lexical/list"
import {
  $convertToMarkdownString,
  QUOTE,
  type MultilineElementTransformer,
  type TextMatchTransformer,
  type Transformer
} from "@lexical/markdown"
import { $isQuoteNode } from "@lexical/rich-text"
import {
  $createParagraphNode,
  $isElementNode,
  $isLineBreakNode,
  $isTextNode,
  type ElementNode
} from "lexical"
import { toMarkdown } from "mdast-util-to-markdown"

import { appendBlocks, definitionsIn } from "./common-mark-import"
import { ImageNode } from "./image-node"
import { parseMarkdown } from "./markdown-parser"

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
  export: (node, children, exportFormat) => {
    if ($isListNode(node)) return ""
    if ($isLineBreakNode(node)) return "  \n"
    if (node instanceof ImageNode)
      return toMarkdown({ type: "image", ...node.getImage() }).trimEnd()
    if ($isLinkNode(node) && !$isAutoLinkNode(node)) {
      const destination = toMarkdown({
        type: "link",
        url: node.getURL(),
        title: node.getTitle(),
        children: []
      })
        .trimEnd()
        .slice(2)
      return `[${children(node)}]${destination}`
    }
    if (!$isTextNode(node)) return null
    if (!node.hasFormat("code")) {
      const [, leading, value, trailing] = /^(\s*)(.*?)(\s*)$/s.exec(
        node.getTextContent()
      ) ?? ["", "", "", ""]
      const escaped = toMarkdown({ type: "text", value })
        .replace(/\n$/, "")
        .replace(/\\([*_`~])/g, "$1")
      return exportFormat(node, leading + escaped + trailing).replace(
        /\\\\/g,
        "\\"
      )
    }
    return exportFormat(
      node,
      toMarkdown({ type: "inlineCode", value: node.getTextContent() }).trimEnd()
    )
  }
}

export function commonMarkTransformers(
  transformers: ReadonlyArray<Transformer>
): Array<Transformer> {
  const content = [...transformers]
  const commonMark = createCommonMarkTransformer(content)
  const nestedBlocks: TextMatchTransformer = {
    type: "text-match",
    dependencies: [],
    regExp: /$^/,
    export: (node, traverseChildren) => {
      if (
        node.isInline() ||
        !$isListItemNode(node.getParent()) ||
        $isListNode(node) ||
        $isTextNode(node) ||
        $isLineBreakNode(node)
      )
        return null
      for (const transformer of [commonMark, ...content]) {
        if (
          transformer.type !== "element" &&
          transformer.type !== "multiline-element"
        )
          continue
        const result = transformer.export?.(node, traverseChildren)
        if (result != null)
          return `\n\n${result}${node.getNextSibling() === null ? "" : "\n\n"}`
      }
      return null
    }
  }
  content.unshift(nestedBlocks)
  return [commonMark, ...content]
}

function createCommonMarkTransformer(
  transformers: ReadonlyArray<Transformer>
): MultilineElementTransformer {
  const transformer: MultilineElementTransformer = {
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
      return $convertToMarkdownString([transformer, ...transformers], node)
        .split("\n")
        .map((line) => (line === "" ? ">" : `> ${line}`))
        .join("\n")
    },
    handleImportAfterStartMatch: ({ lines, rootNode, startLineIndex }) => {
      const source = lines.slice(startLineIndex).join("\n")
      const tree = parseMarkdown(source)
      const definitions = definitionsIn(tree.children)
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
  return transformer
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
      for (const nested of item.getChildren().filter($isListNode))
        output.push(exportList(nested, traverseChildren, depth + 1))
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
    output.push(
      indent + prefix + escaped.replace(/\n(?=.)/g, `\n${indent}    `)
    )
  }
  return output.join("\n")
}

function hasListContinuation(list: ListNode): boolean {
  return list.getChildren().some((item) => {
    if (!$isListItemNode(item)) return false
    return item
      .getChildren()
      .some((child) =>
        $isListNode(child)
          ? item.getChildrenSize() > 1 || hasListContinuation(child)
          : !child.isInline() && !$isTextNode(child) && !$isLineBreakNode(child)
      )
  })
}
