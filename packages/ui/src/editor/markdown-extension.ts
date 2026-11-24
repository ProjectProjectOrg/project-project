import { CodeNode } from "@lexical/code-core"
import {
  $createListItemNode,
  $createListNode,
  $isListItemNode,
  $isListNode,
  ListNode
} from "@lexical/list"
import {
  MdastAutolinkLiteralExtension,
  MdastCommonMarkExtension,
  MdastExtension,
  MdastShadowRootQuoteExtension,
  MdastStrikethroughExtension,
  MdastTableExtension,
  MdastTaskListExtension,
  type MdastExportContext,
  type MdastExportHandler,
  type MdastImportContext,
  type MdastConfig,
  type MdastImportHandler,
  type MdastNode
} from "@lexical/mdast"
import { QuoteNode } from "@lexical/rich-text"
import { getCSSFromStyleObject } from "@lexical/selection"
import { $isTableCellNode, $isTableNode } from "@lexical/table"
import {
  $createLineBreakNode,
  $createParagraphNode,
  $createTextNode,
  $isElementNode,
  $isParagraphNode,
  $isTextNode,
  configExtension,
  getStyleObjectFromCSS,
  IS_BOLD,
  IS_ITALIC,
  IS_STRIKETHROUGH,
  defineExtension,
  LineBreakNode,
  ParagraphNode,
  TextNode,
  type LexicalNode
} from "lexical"
import type {
  BlockContent,
  Definition,
  Html,
  Image,
  ImageReference,
  List,
  LinkReference,
  ListItem,
  Paragraph,
  Root,
  RootContent,
  Text
} from "mdast"

import { PLAIN_CODE_LANGUAGE } from "./code-highlight"
import { $createImageNode, ImageNode } from "./image-node"

const sourceOf = (node: MdastNode, context: MdastImportContext) =>
  node.position?.start.offset === undefined
    ? ""
    : context.source.slice(node.position.start.offset, node.position.end.offset)

const $importText: MdastImportHandler<Text | Html> = (node, context) =>
  $createTextNode(node.value).setFormat(context.format)

const htmlBlocksAsParagraphs: (node: Root | RootContent) => void = (node) => {
  if (!("children" in node)) return
  if (
    node.type === "root" ||
    node.type === "blockquote" ||
    node.type === "ticketBlock"
  )
    for (const [index, child] of node.children.entries())
      if (child.type === "html")
        node.children[index] = {
          type: "paragraph",
          children: [child],
          position: child.position
        }
  node.children.forEach(htmlBlocksAsParagraphs)
}

const $importParagraph: MdastImportHandler<Paragraph> = (node, context) => {
  const paragraph = $createParagraphNode().append(
    ...context.importChildren(node)
  )
  const trailing = /[ \t]+$/.exec(sourceOf(node, context))?.[0]
  if (trailing !== undefined) paragraph.append($createTextNode(trailing))
  return paragraph
}

const $importImage: MdastImportHandler<Image | ImageReference> = (
  node,
  context
) => {
  const target =
    node.type === "image" ? node : context.getDefinition(node.identifier)
  if (target === undefined) return $createTextNode(sourceOf(node, context))
  return $createImageNode({
    url: target.url,
    alt: node.alt,
    title: target.title
  })
}

const isFootnoteLabel = (label: string | null | undefined) =>
  label?.startsWith("^") === true

const $importLinkReference: MdastImportHandler<LinkReference> = (
  node,
  context
) =>
  isFootnoteLabel(node.label)
    ? $createTextNode(sourceOf(node, context)).setFormat(context.format)
    : context.next()

const $importDefinition: MdastImportHandler<Definition> = (node, context) =>
  isFootnoteLabel(node.label)
    ? $createParagraphNode().append($createTextNode(sourceOf(node, context)))
    : context.next()

const taskChecked = (item: ListItem, context: MdastImportContext) => {
  if (item.checked != null) return item.checked
  const marker = /^[-*+]\s+\[([ xX])\][ \t]+$/.exec(sourceOf(item, context))
  return marker === null ? null : marker[1] !== " "
}

const $importListItem = (
  item: ListItem,
  checked: boolean | null,
  context: MdastImportContext
) => {
  const entries = [$createListItemNode(checked ?? undefined)]
  for (const child of item.children) {
    const entry = entries[entries.length - 1]
    if (child.type === "list") {
      entries.push($createListItemNode().append(...context.importNode(child)))
      continue
    }
    if (child.type !== "paragraph") {
      entry.append(...context.importNode(child))
      continue
    }
    if (
      item.checked == null &&
      checked !== null &&
      /^\[[ xX]\]$/.test(sourceOf(child, context).trim())
    )
      continue
    if (!entry.isEmpty() && !$isListNode(entry.getLastChild()))
      entry.append($createLineBreakNode())
    entry.append(...context.importChildren(child))
  }
  return entries
}

const $importList: MdastImportHandler<List> = (node, context) => {
  const lists: Array<ListNode> = []
  node.children.forEach((item, index) => {
    const checked = taskChecked(item, context)
    const listType = node.ordered
      ? "number"
      : checked === null
        ? "bullet"
        : "check"
    const current = lists.at(-1)
    const list =
      current?.getListType() === listType
        ? current
        : $createListNode(listType, (node.start ?? 1) + index)
    if (list !== current) lists.push(list)
    list.append(...$importListItem(item, checked, context))
  })
  return lists
}

const $importTable: MdastImportHandler = (_node, context) => {
  const output = context.next()
  const cells = output
    .filter($isTableNode)
    .flatMap((table) => table.getChildren())
    .flatMap((row) => ($isElementNode(row) ? row.getChildren() : []))
  for (const cell of cells) {
    if (!$isTableCellNode(cell)) continue
    const paragraph = cell.getFirstChild()
    if (!$isParagraphNode(paragraph)) continue
    cell.setFormat(paragraph.getFormatType())
    paragraph.setFormat("")
  }
  return output
}

const hardenBreaks = (nodes: ReadonlyArray<MdastNode>) => {
  for (const node of nodes) {
    if (node.type === "break" && !node.data?.mdastBreak)
      node.data = { ...node.data, mdastBreak: "  " }
    if ("children" in node) hardenBreaks(node.children)
  }
  return nodes
}

const $hardenedBreaks: MdastExportHandler = (_node, context) => [
  ...hardenBreaks(context.next())
]

const $isBulletedList = (node: LexicalNode | null): node is ListNode =>
  $isListNode(node) && node.getListType() !== "number"

const appendList = (children: ListItem["children"], list: List) => {
  const last = children.at(-1)
  if (last?.type === "list" && !last.ordered && !list.ordered)
    last.children.push(...list.children)
  else children.push(list)
}

const exportTaskItem = (checked: boolean, children: Array<BlockContent>) =>
  (children.length === 1 &&
  children[0].type === "paragraph" &&
  children[0].children.length === 0
    ? {
        type: "listItem",
        checked: null,
        spread: false,
        children: [
          {
            type: "paragraph",
            children: [{ type: "html", value: `[${checked ? "x" : " "}] ` }]
          }
        ]
      }
    : {
        type: "listItem",
        checked,
        spread: children.length > 1,
        children
      }) satisfies ListItem

const $exportListItems = (
  list: ListNode,
  items: Array<ListItem>,
  context: MdastExportContext
) => {
  for (const item of list.getChildren()) {
    if (!$isListItemNode(item)) continue
    if ($isListNode(item.getFirstChild())) {
      const previous = items.at(-1)
      const target: ListItem = previous ?? {
        type: "listItem",
        spread: false,
        children: []
      }
      if (previous === undefined) items.push(target)
      const nested = context
        .exportChildren(item.getChildren().filter($isListNode))
        .filter((block): block is List => block.type === "list")
      for (const block of nested) appendList(target.children, block)
      const rest = item.getChildren().filter((child) => !$isListNode(child))
      if (rest.length > 0) {
        const blocks = context.exportBlocks(rest)
        hardenBreaks(blocks)
        target.children.push(...blocks)
        target.spread = true
      }
      continue
    }
    const children = context.exportBlocks(item)
    hardenBreaks(children)
    items.push(
      list.getListType() === "check"
        ? exportTaskItem(item.getChecked() ?? false, children)
        : {
            type: "listItem",
            checked: null,
            spread: children.length > 1,
            children
          }
    )
  }
}

const $listRun = (list: ListNode) => {
  const run = [list]
  let next = list.getNextSibling()
  while ($isBulletedList(list) && $isBulletedList(next)) {
    run.push(next)
    next = next.getNextSibling()
  }
  return run
}

const $exportList: MdastExportHandler = (node, context) => {
  if (!$isListNode(node)) return null
  if ($isBulletedList(node) && $isBulletedList(node.getPreviousSibling()))
    return []
  const ordered = node.getListType() === "number"
  const list: List = {
    type: "list",
    ordered,
    start: ordered ? node.getStart() : undefined,
    spread: false,
    children: []
  }
  for (const member of $listRun(node))
    $exportListItems(member, list.children, context)
  return list
}

const $exportParagraph: MdastExportHandler = (_node, context) => {
  const output = context.next()
  for (const paragraph of output) {
    if (paragraph.type !== "paragraph") continue
    const last = paragraph.children.at(-1)
    if (last?.type !== "text") continue
    const trailing = /[ \t]+$/.exec(last.value)?.[0]
    if (trailing === undefined) continue
    last.value = last.value.slice(0, -trailing.length)
    if (last.value === "") paragraph.children.pop()
    paragraph.children.push({ type: "html", value: trailing })
  }
  return output
}

const $exportCode: MdastExportHandler = (_node, context) => {
  const output = context.next()
  for (const code of output)
    if (code.type === "code" && code.lang === PLAIN_CODE_LANGUAGE)
      code.lang = null
  return output
}

const innermost: (node: MdastNode) => MdastNode = (node) =>
  "children" in node && node.children.length === 1
    ? innermost(node.children[0])
    : node

const edgeText = (value: string) =>
  value === "" ? [] : [{ type: "text", value } satisfies Text]

const EMPHASIS = IS_BOLD | IS_ITALIC | IS_STRIKETHROUGH

const $sharesEmphasis = (node: TextNode, other: LexicalNode | null) =>
  $isTextNode(other) && (node.getFormat() & other.getFormat() & EMPHASIS) !== 0

const $exportText: MdastExportHandler = (node, context) => {
  const output = context.next()
  const [phrasing] = output
  const leaf = phrasing === undefined ? null : innermost(phrasing)
  if (
    !$isTextNode(node) ||
    output.length !== 1 ||
    leaf?.type !== "text" ||
    leaf === phrasing
  )
    return output
  const [, leading, core, trailing] = /^([ \t]*)(.*?)([ \t]*)$/s.exec(
    leaf.value
  ) ?? ["", "", leaf.value, ""]
  if (core === "") return [{ type: "text", value: leaf.value }]
  const before = $sharesEmphasis(node, node.getPreviousSibling()) ? "" : leading
  const after = $sharesEmphasis(node, node.getNextSibling()) ? "" : trailing
  leaf.value = leaf.value.slice(before.length, leaf.value.length - after.length)
  return [...edgeText(before), phrasing, ...edgeText(after)]
}

const $exportImage: MdastExportHandler = (node) =>
  node instanceof ImageNode ? { type: "image", ...node.getImage() } : null

export const MarkdownExtension = defineExtension({
  name: "@pp/markdown",
  nodes: [ImageNode],
  register: (editor) =>
    editor.registerNodeTransform(TextNode, (node) => {
      const style = node.getStyle()
      if (!style.includes("color") || !node.getParents().some($isTableCellNode))
        return
      const properties = getStyleObjectFromCSS(style)
      if (properties.color === undefined) return
      delete properties.color
      node.setStyle(getCSSFromStyleObject(properties))
    }),
  dependencies: [
    MdastCommonMarkExtension,
    MdastAutolinkLiteralExtension,
    MdastShadowRootQuoteExtension,
    MdastStrikethroughExtension,
    MdastTaskListExtension,
    MdastTableExtension,
    configExtension(MdastExtension, {
      importRules: [
        { type: "text", $import: $importText },
        { type: "html", $import: $importText },
        { type: "paragraph", $import: $importParagraph },
        { type: "image", $import: $importImage },
        { type: "imageReference", $import: $importImage },
        { type: "list", $import: $importList },
        { type: "linkReference", $import: $importLinkReference },
        { type: "definition", $import: $importDefinition },
        { type: "table", $import: $importTable }
      ],
      exportRules: [
        { type: TextNode, $export: $exportText },
        { type: ParagraphNode, $export: $exportParagraph },
        { type: LineBreakNode, $export: $hardenedBreaks },
        { type: QuoteNode, $export: $hardenedBreaks },
        { type: ListNode, $export: $exportList },
        { type: CodeNode, $export: $exportCode },
        { type: ImageNode, $export: $exportImage }
      ],
      mdastExtensions: [
        {
          transforms: [htmlBlocksAsParagraphs]
        } satisfies MdastConfig["mdastExtensions"][number]
      ],
      toMarkdownExtensions: [
        { emphasis: "*", strong: "*", rule: "-", resourceLink: true }
      ]
    })
  ]
})

export const plainText: (node: MdastNode) => string = (node) =>
  "value" in node
    ? node.value
    : "children" in node
      ? node.children.map(plainText).join("")
      : ""
