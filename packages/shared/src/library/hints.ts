import * as Data from "effect/Data"

import { advanceFence, normalizeLineEndings } from "../tickets/blocks"

export const HINT = /\{\{([^{}\n]{1,200})\}\}\s*$/

const HINT_WITH_LEADING_SPACE = /\s*\{\{[^{}\n]{1,200}\}\}\s*$/

const BARE_LIST_MARKER = /^\s*(?:[-*+]|\d{1,9}[.)])(?:\s+\[[ xX]\])?$/

const HEADING = /^ {0,3}#{1,6}(?:[ \t]+(.*?))?[ \t]*$/

const THEMATIC_BREAK = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/

const LIST_ITEM = /^( {0,3})([-*+]|\d{1,9}[.)])(?:([ \t]+)(.*))?$/

const TASK_BOX = /^\[[ xX]\](?:[ \t]+(.*))?$/

const LEAF_START = /^ {0,3}[>|<]/

export type HintListKind = "bulletList" | "orderedList" | "taskList"

export type HintTextKind = "heading" | "paragraph" | "other"

export type BlockOutlineNode = Data.TaggedEnum<{
  text: Readonly<{ kind: HintTextKind; text: string }>
  list: Readonly<{ kind: HintListKind; items: ReadonlyArray<string> }>
}>

export const BlockOutlineNode = Data.taggedEnum<BlockOutlineNode>()

export type HintNodeKind = BlockOutlineNode["kind"]

export type HintSlot = Readonly<{
  path: ReadonlyArray<number>
  kind: HintNodeKind
  prefix: string
  hint: string
}>

type OutlineLine = Data.TaggedEnum<{
  blank: {}
  fence: {}
  break: {}
  leaf: {}
  heading: Readonly<{ text: string }>
  text: Readonly<{ text: string }>
  item: Readonly<{
    kind: HintListKind
    text: string
    indent: number
    contentOffset: number
  }>
}>

const OutlineLine = Data.taggedEnum<OutlineLine>()

type ItemLine = Extract<OutlineLine, { _tag: "item" }>

type ReadResult = readonly [BlockOutlineNode, number, ReadonlyArray<number>?]

const opensFence = (line: string) => advanceFence(line, null) !== null

const stripLineHint = (line: string, accepts: (hint: string) => boolean) => {
  const match = HINT.exec(line)
  if (match === null || !accepts(match[1].trim())) return line
  const stripped = line.replace(HINT_WITH_LEADING_SPACE, "")
  return BARE_LIST_MARKER.test(stripped) ? `${stripped} ` : stripped
}

const linesOutsideCode = (markdown: string) => {
  let fence: string | null = null
  return normalizeLineEndings(markdown)
    .split("\n")
    .map((line) => {
      const insideCode = fence !== null || opensFence(line)
      fence = advanceFence(line, fence)
      return [line, insideCode] as const
    })
}

const stripMatchingHints = (
  markdown: string,
  accepts: (hint: string) => boolean
) =>
  linesOutsideCode(markdown)
    .map(([line, insideCode]) =>
      insideCode ? line : stripLineHint(line, accepts)
    )
    .join("\n")

export const stripHints = (markdown: string) =>
  stripMatchingHints(markdown, () => true)

const hintsOf = (definitionContent: string) =>
  new Set(
    linesOutsideCode(definitionContent).flatMap(([line, insideCode]) => {
      const match = insideCode ? null : HINT.exec(line)
      return match === null ? [] : [match[1].trim()]
    })
  )

export const stripDefinitionHints = (
  markdown: string,
  definitionContent: string
) => {
  const hints = hintsOf(definitionContent)
  return stripMatchingHints(markdown, (hint) => hints.has(hint))
}

const indentOf = (line: string) => line.length - line.trimStart().length

const classifyItem = (match: RegExpExecArray) => {
  const [, indent, marker, spacing = " ", rest = ""] = match
  const task = TASK_BOX.exec(rest)
  const ordered = /\d/.test(marker)
  return OutlineLine.item({
    kind: task !== null ? "taskList" : ordered ? "orderedList" : "bulletList",
    text: (task === null ? rest : (task[1] ?? "")).trim(),
    indent: indent.length,
    contentOffset: indent.length + marker.length + Math.min(spacing.length, 4)
  })
}

const classifyLine = (line: string) => {
  if (line.trim() === "") return OutlineLine.blank()
  if (opensFence(line)) return OutlineLine.fence()
  if (THEMATIC_BREAK.test(line)) return OutlineLine.break()
  const heading = HEADING.exec(line)
  if (heading !== null)
    return OutlineLine.heading({ text: (heading[1] ?? "").trim() })
  const item = LIST_ITEM.exec(line)
  if (item !== null) return classifyItem(item)
  if (LEAF_START.test(line)) return OutlineLine.leaf()
  return OutlineLine.text({ text: line.trim() })
}

const readFence = (lines: ReadonlyArray<string>, start: number) => {
  let fence = advanceFence(lines[start], null)
  let index = start + 1
  while (index < lines.length && fence !== null) {
    fence = advanceFence(lines[index], fence)
    index++
  }
  return [
    BlockOutlineNode.text({
      kind: "other",
      text: lines.slice(start, index).join("\n")
    }),
    index
  ] satisfies ReadResult
}

const readWhile = (
  lines: ReadonlyArray<string>,
  start: number,
  accepts: (line: OutlineLine) => boolean
) => {
  let index = start + 1
  while (index < lines.length && accepts(classifyLine(lines[index]))) index++
  return index
}

const readParagraph = (lines: ReadonlyArray<string>, start: number) => {
  const end = readWhile(lines, start, OutlineLine.$is("text"))
  const text = lines
    .slice(start, end)
    .map((line) => line.trim())
    .join("\n")
  return [
    BlockOutlineNode.text({ kind: "paragraph", text }),
    end
  ] satisfies ReadResult
}

const readLeaf = (lines: ReadonlyArray<string>, start: number) => {
  const end = readWhile(
    lines,
    start,
    (line) => OutlineLine.$is("leaf")(line) || OutlineLine.$is("text")(line)
  )
  return [
    BlockOutlineNode.text({
      kind: "other",
      text: lines.slice(start, end).join("\n")
    }),
    end
  ] satisfies ReadResult
}

const isSiblingItem = (line: OutlineLine, first: ItemLine): line is ItemLine =>
  OutlineLine.$is("item")(line) && line.indent < first.contentOffset

const nextNonBlank = (lines: ReadonlyArray<string>, start: number) => {
  for (let index = start; index < lines.length; index++) {
    if (lines[index].trim() !== "") return index
  }
  return null
}

const continuesListAfterBlank = (line: string, first: ItemLine) => {
  const classified = classifyLine(line)
  return isSiblingItem(classified, first)
    ? classified.kind === first.kind
    : indentOf(line) >= first.contentOffset
}

const readList = (
  lines: ReadonlyArray<string>,
  start: number,
  first: ItemLine
) => {
  const items: Array<Array<string>> = [[first.text]]
  const starts: Array<number> = [start]
  let index = start + 1
  while (index < lines.length) {
    const line = classifyLine(lines[index])
    if (isSiblingItem(line, first)) {
      if (line.kind !== first.kind) break
      items.push([line.text])
      starts.push(index)
      index++
    } else if (OutlineLine.$is("blank")(line)) {
      const next = nextNonBlank(lines, index)
      if (next === null || !continuesListAfterBlank(lines[next], first)) break
      index = next
    } else if (
      OutlineLine.$is("text")(line) ||
      indentOf(lines[index]) >= first.contentOffset
    ) {
      items[items.length - 1].push(lines[index].trim())
      index++
    } else {
      break
    }
  }
  const texts = items.map((parts) =>
    parts.filter((part) => part !== "").join("\n")
  )
  return [
    BlockOutlineNode.list({ kind: first.kind, items: texts }),
    index,
    starts
  ] satisfies ReadResult
}

const readOther = (lines: ReadonlyArray<string>, start: number) =>
  [
    BlockOutlineNode.text({ kind: "other", text: lines[start] }),
    start + 1
  ] satisfies ReadResult

const readNode = (
  lines: ReadonlyArray<string>,
  start: number,
  line: OutlineLine
) =>
  OutlineLine.$match(line, {
    fence: () => readFence(lines, start),
    heading: ({ text }) =>
      [
        BlockOutlineNode.text({ kind: "heading", text }),
        start + 1
      ] satisfies ReadResult,
    item: (item) => readList(lines, start, item),
    text: () => readParagraph(lines, start),
    leaf: () => readLeaf(lines, start),
    blank: () => readOther(lines, start),
    break: () => readOther(lines, start)
  })

type OutlineEntry = Readonly<{
  node: BlockOutlineNode
  starts: ReadonlyArray<number>
}>

const outlineEntries = (lines: ReadonlyArray<string>) => {
  const entries: Array<OutlineEntry> = []
  let index = 0
  while (index < lines.length) {
    const line = classifyLine(lines[index])
    if (OutlineLine.$is("blank")(line)) {
      index++
      continue
    }
    const [node, next, starts = [index]] = readNode(lines, index, line)
    entries.push({ node, starts })
    index = next
  }
  return entries
}

export const outlineBlockContent = (markdown: string) =>
  outlineEntries(normalizeLineEndings(markdown).split("\n")).map(
    (entry) => entry.node
  )

const slotFor = (
  path: ReadonlyArray<number>,
  kind: HintNodeKind,
  text: string
) => {
  const match = HINT.exec(text)
  return match === null
    ? []
    : [
        {
          path,
          kind,
          prefix: text.slice(0, match.index).trim(),
          hint: match[1].trim()
        }
      ]
}

const slotsOfNode = (node: BlockOutlineNode, index: number) => {
  if (BlockOutlineNode.$is("list")(node))
    return node.items.flatMap((item, itemIndex) =>
      slotFor([index, itemIndex], node.kind, item)
    )
  return node.kind === "other" ? [] : slotFor([index], node.kind, node.text)
}

const slotsOfOutline = (outline: ReadonlyArray<BlockOutlineNode>) =>
  outline.flatMap(slotsOfNode)

export const hintSlots = (definitionContent: string) =>
  slotsOfOutline(outlineBlockContent(definitionContent))

const alignedNodeCount = (
  definition: ReadonlyArray<BlockOutlineNode>,
  ticket: ReadonlyArray<BlockOutlineNode>
) => {
  let count = 0
  while (
    count < definition.length &&
    count < ticket.length &&
    definition[count].kind === ticket[count].kind
  ) {
    count++
  }
  return count
}

const textAtPath = (node: BlockOutlineNode, path: ReadonlyArray<number>) => {
  if (BlockOutlineNode.$is("list")(node))
    return path.length === 2 ? node.items[path[1]] : undefined
  return path.length === 1 ? node.text : undefined
}

const comparableText = (text: string) =>
  text
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim()

const isUnfilled = (node: BlockOutlineNode, slot: HintSlot) => {
  const text = textAtPath(node, slot.path)
  return (
    text !== undefined && comparableText(text) === comparableText(slot.prefix)
  )
}

export const alignedHintSlots = (
  definitionContent: string,
  ticket: ReadonlyArray<BlockOutlineNode>
) => {
  const definition = outlineBlockContent(definitionContent)
  const aligned = alignedNodeCount(definition, ticket)
  return slotsOfOutline(definition).filter(
    (slot) =>
      slot.path[0] < aligned &&
      textAtPath(ticket[slot.path[0]], slot.path) !== undefined
  )
}

export const activeHintSlots = (
  definitionContent: string,
  ticket: ReadonlyArray<BlockOutlineNode>
) =>
  alignedHintSlots(definitionContent, ticket).filter((slot) =>
    isUnfilled(ticket[slot.path[0]], slot)
  )

const isHintOnlyParagraph = (
  node: BlockOutlineNode
): node is Extract<BlockOutlineNode, { _tag: "text" }> =>
  BlockOutlineNode.$is("text")(node) &&
  node.kind === "paragraph" &&
  HINT.test(node.text) &&
  stripHints(node.text).trim() === ""

const withHint = (line: string, hint: string) => {
  const trimmed = line.trimEnd()
  return trimmed === "" ? `{{${hint}}}` : `${trimmed} {{${hint}}}`
}

export const restoreDefinitionHints = (
  content: string,
  definitionContent: string
) => {
  const lines = normalizeLineEndings(content).split("\n")
  const ticket = outlineEntries(lines)
  const hinted = new Map<number, string>()
  const inserted = new Map<number, Array<string>>()
  let cursor = 0
  for (const [index, node] of outlineBlockContent(
    definitionContent
  ).entries()) {
    const entry = ticket.at(cursor)
    if (isHintOnlyParagraph(node) && entry?.node.kind !== "paragraph") {
      const at = entry?.starts[0] ?? lines.length
      inserted.set(at, [...(inserted.get(at) ?? []), node.text])
      continue
    }
    if (entry === undefined || entry.node.kind !== node.kind) break
    for (const slot of slotsOfNode(node, index)) {
      const line = entry.starts[slot.path[1] ?? 0]
      if (line !== undefined && isUnfilled(entry.node, slot))
        hinted.set(line, slot.hint)
    }
    cursor++
  }
  const output: Array<string> = []
  const insert = (texts: ReadonlyArray<string> | undefined, more: boolean) => {
    if (texts === undefined) return
    while (output.at(-1)?.trim() === "") output.pop()
    for (const text of texts)
      output.push(...(output.length === 0 ? [] : [""]), text)
    if (more) output.push("")
  }
  for (const [index, line] of lines.entries()) {
    insert(inserted.get(index), true)
    const hint = hinted.get(index)
    output.push(hint === undefined ? line : withHint(line, hint))
  }
  insert(inserted.get(lines.length), false)
  return output.join("\n")
}
