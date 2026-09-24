import {
  outlineBlockContent,
  parseTicketBlocks,
  type BlockIconName,
  type BlockLookup,
  type BlockOutlineNode,
  type HintListKind
} from "@pp/shared"

import { blockChrome } from "@/components/blocks/blockChrome"

export type SketchLine = "heading" | "text" | "bullet" | "number" | "task"

export type SketchBlock = Readonly<{
  key: string
  name: string
  icon: BlockIconName
  color: string | null
  lines: ReadonlyArray<SketchLine>
}>

const LIST_LINES: Readonly<Record<HintListKind, SketchLine>> = {
  bulletList: "bullet",
  orderedList: "number",
  taskList: "task"
}

const CHARS_PER_LINE = 45

const nodeLines = (node: BlockOutlineNode): ReadonlyArray<SketchLine> => {
  if ("items" in node) return node.items.map(() => LIST_LINES[node.kind])
  if (node.kind === "heading") return ["heading"]
  const wrapped = Math.ceil(node.text.length / CHARS_PER_LINE)
  return Array.from(
    { length: Math.min(3, Math.max(1, wrapped)) },
    (): SketchLine => "text"
  )
}

export const sketchLines = (
  content: string,
  limit: number
): ReadonlyArray<SketchLine> => {
  const nodes = outlineBlockContent(content)
  const body = nodes[0]?.kind === "heading" ? nodes.slice(1) : nodes
  return body.flatMap(nodeLines).slice(0, limit)
}

export const templateSketch = (
  body: string,
  lookup: BlockLookup,
  linesPerBlock: number
): ReadonlyArray<SketchBlock> =>
  parseTicketBlocks(body).flatMap((segment, index) => {
    if (segment.kind !== "block") return []
    const chrome = blockChrome(segment.type, lookup)
    const content =
      segment.content.trim() === ""
        ? (lookup(segment.type)?.content ?? "")
        : segment.content
    return [
      {
        key: `${segment.type}:${index}`,
        name: chrome.name,
        icon: chrome.icon,
        color: chrome.color,
        lines: sketchLines(content, linesPerBlock)
      }
    ]
  })
