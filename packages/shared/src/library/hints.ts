import { advanceFence, normalizeLineEndings } from "../ticketBlocks"

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

export type BlockOutlineNode =
  | Readonly<{ kind: HintTextKind; text: string }>
  | Readonly<{ kind: HintListKind; items: ReadonlyArray<string> }>

export type HintNodeKind = BlockOutlineNode["kind"]

export type HintSlot = Readonly<{
  path: ReadonlyArray<number>
  kind: HintNodeKind
  prefix: string
  hint: string
}>

type ItemLine = Readonly<{
  tag: "item"
  kind: HintListKind
  text: string
  indent: number
  contentOffset: number
}>

type OutlineLine =
  | Readonly<{ tag: "blank" | "fence" | "break" | "leaf" }>
  | Readonly<{ tag: "heading" | "text"; text: string }>
  | ItemLine

type ReadResult = readonly [BlockOutlineNode, number, ReadonlyArray<number>?]

const opensFence = (line: string): boolean => advanceFence(line, null) !== null

const stripLineHint = (
  line: string,
  accepts: (hint: string) => boolean
): string => {
  const match = HINT.exec(line)
  if (match === null || !accepts(match[1].trim())) return line
  const stripped = line.replace(HINT_WITH_LEADING_SPACE, "")
  return BARE_LIST_MARKER.test(stripped) ? `${stripped} ` : stripped
}

const linesOutsideCode = (
  markdown: string
): ReadonlyArray<readonly [string, boolean]> => {
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
): string =>
  linesOutsideCode(markdown)
    .map(([line, insideCode]) =>
      insideCode ? line : stripLineHint(line, accepts)
    )
    .join("\n")

export const stripHints = (markdown: string): string =>
  stripMatchingHints(markdown, () => true)

const hintsOf = (definitionContent: string): ReadonlySet<string> =>
  new Set(
    linesOutsideCode(definitionContent).flatMap(([line, insideCode]) => {
      const match = insideCode ? null : HINT.exec(line)
      return match === null ? [] : [match[1].trim()]
    })
  )

export const stripDefinitionHints = (
  markdown: string,
  definitionContent: string
): string => {
  const hints = hintsOf(definitionContent)
  return stripMatchingHints(markdown, (hint) => hints.has(hint))
}

const indentOf = (line: string): number => line.length - line.trimStart().length

const classifyItem = (match: RegExpExecArray): ItemLine => {
  const [, indent, marker, spacing = " ", rest = ""] = match
  const task = TASK_BOX.exec(rest)
  const ordered = /\d/.test(marker)
  return {
    tag: "item",
    kind: task !== null ? "taskList" : ordered ? "orderedList" : "bulletList",
    text: (task === null ? rest : (task[1] ?? "")).trim(),
    indent: indent.length,
    contentOffset: indent.length + marker.length + Math.min(spacing.length, 4)
  }
}

const classifyLine = (line: string): OutlineLine => {
  if (line.trim() === "") return { tag: "blank" }
  if (opensFence(line)) return { tag: "fence" }
  if (THEMATIC_BREAK.test(line)) return { tag: "break" }
  const heading = HEADING.exec(line)
  if (heading !== null)
    return { tag: "heading", text: (heading[1] ?? "").trim() }
  const item = LIST_ITEM.exec(line)
  if (item !== null) return classifyItem(item)
  if (LEAF_START.test(line)) return { tag: "leaf" }
  return { tag: "text", text: line.trim() }
}

const readFence = (lines: ReadonlyArray<string>, start: number): ReadResult => {
  let fence = advanceFence(lines[start], null)
  let index = start + 1
  while (index < lines.length && fence !== null) {
    fence = advanceFence(lines[index], fence)
    index++
  }
  return [{ kind: "other", text: lines.slice(start, index).join("\n") }, index]
}

const readWhile = (
  lines: ReadonlyArray<string>,
  start: number,
  accepts: (line: OutlineLine) => boolean
): number => {
  let index = start + 1
  while (index < lines.length && accepts(classifyLine(lines[index]))) index++
  return index
}

const readParagraph = (
  lines: ReadonlyArray<string>,
  start: number
): ReadResult => {
  const end = readWhile(lines, start, (line) => line.tag === "text")
  const text = lines
    .slice(start, end)
    .map((line) => line.trim())
    .join("\n")
  return [{ kind: "paragraph", text }, end]
}

const readLeaf = (lines: ReadonlyArray<string>, start: number): ReadResult => {
  const end = readWhile(
    lines,
    start,
    (line) => line.tag === "leaf" || line.tag === "text"
  )
  return [{ kind: "other", text: lines.slice(start, end).join("\n") }, end]
}

const isSiblingItem = (line: OutlineLine, first: ItemLine): line is ItemLine =>
  line.tag === "item" && line.indent < first.contentOffset

const nextNonBlank = (
  lines: ReadonlyArray<string>,
  start: number
): number | null => {
  for (let index = start; index < lines.length; index++) {
    if (lines[index].trim() !== "") return index
  }
  return null
}

const continuesListAfterBlank = (line: string, first: ItemLine): boolean => {
  const classified = classifyLine(line)
  return isSiblingItem(classified, first)
    ? classified.kind === first.kind
    : indentOf(line) >= first.contentOffset
}

const readList = (
  lines: ReadonlyArray<string>,
  start: number,
  first: ItemLine
): ReadResult => {
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
    } else if (line.tag === "blank") {
      const next = nextNonBlank(lines, index)
      if (next === null || !continuesListAfterBlank(lines[next], first)) break
      index = next
    } else if (
      line.tag === "text" ||
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
  return [{ kind: first.kind, items: texts }, index, starts]
}

const readNode = (
  lines: ReadonlyArray<string>,
  start: number,
  line: OutlineLine
): ReadResult => {
  switch (line.tag) {
    case "fence":
      return readFence(lines, start)
    case "heading":
      return [{ kind: "heading", text: line.text }, start + 1]
    case "item":
      return readList(lines, start, line)
    case "text":
      return readParagraph(lines, start)
    case "leaf":
      return readLeaf(lines, start)
    default:
      return [{ kind: "other", text: lines[start] }, start + 1]
  }
}

type OutlineEntry = Readonly<{
  node: BlockOutlineNode
  starts: ReadonlyArray<number>
}>

const outlineEntries = (
  lines: ReadonlyArray<string>
): ReadonlyArray<OutlineEntry> => {
  const entries: Array<OutlineEntry> = []
  let index = 0
  while (index < lines.length) {
    const line = classifyLine(lines[index])
    if (line.tag === "blank") {
      index++
      continue
    }
    const [node, next, starts = [index]] = readNode(lines, index, line)
    entries.push({ node, starts })
    index = next
  }
  return entries
}

export const outlineBlockContent = (
  markdown: string
): ReadonlyArray<BlockOutlineNode> =>
  outlineEntries(normalizeLineEndings(markdown).split("\n")).map(
    (entry) => entry.node
  )

const slotFor = (
  path: ReadonlyArray<number>,
  kind: HintNodeKind,
  text: string
): ReadonlyArray<HintSlot> => {
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

const slotsOfNode = (
  node: BlockOutlineNode,
  index: number
): ReadonlyArray<HintSlot> => {
  if ("items" in node)
    return node.items.flatMap((item, itemIndex) =>
      slotFor([index, itemIndex], node.kind, item)
    )
  return node.kind === "other" ? [] : slotFor([index], node.kind, node.text)
}

const slotsOfOutline = (
  outline: ReadonlyArray<BlockOutlineNode>
): ReadonlyArray<HintSlot> => outline.flatMap(slotsOfNode)

export const hintSlots = (definitionContent: string): ReadonlyArray<HintSlot> =>
  slotsOfOutline(outlineBlockContent(definitionContent))

const alignedNodeCount = (
  definition: ReadonlyArray<BlockOutlineNode>,
  ticket: ReadonlyArray<BlockOutlineNode>
): number => {
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

const textAtPath = (
  node: BlockOutlineNode,
  path: ReadonlyArray<number>
): string | undefined => {
  if ("items" in node)
    return path.length === 2 ? node.items[path[1]] : undefined
  return path.length === 1 ? node.text : undefined
}

const comparableText = (text: string): string =>
  text
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim()

const isUnfilled = (node: BlockOutlineNode, slot: HintSlot): boolean => {
  const text = textAtPath(node, slot.path)
  return (
    text !== undefined && comparableText(text) === comparableText(slot.prefix)
  )
}

export const alignedHintSlots = (
  definitionContent: string,
  ticket: ReadonlyArray<BlockOutlineNode>
): ReadonlyArray<HintSlot> => {
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
): ReadonlyArray<HintSlot> =>
  alignedHintSlots(definitionContent, ticket).filter((slot) =>
    isUnfilled(ticket[slot.path[0]], slot)
  )

const isHintOnlyParagraph = (
  node: BlockOutlineNode
): node is Readonly<{
  kind: "paragraph"
  text: string
}> =>
  node.kind === "paragraph" &&
  HINT.test(node.text) &&
  stripHints(node.text).trim() === ""

const withHint = (line: string, hint: string): string => {
  const trimmed = line.trimEnd()
  return trimmed === "" ? `{{${hint}}}` : `${trimmed} {{${hint}}}`
}

export const restoreDefinitionHints = (
  content: string,
  definitionContent: string
): string => {
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
