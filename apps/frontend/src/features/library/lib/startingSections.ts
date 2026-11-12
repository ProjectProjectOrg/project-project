import {
  outlineBlockContent,
  parseTicketBlocks,
  serializeTicketBlocks,
  type BlockDefinition,
  type BlockOutlineNode,
  type Library,
  type TicketBlockSegment
} from "@pp/shared"

export type StartingRow =
  | Readonly<{ id: string; kind: "section"; key: string }>
  | Readonly<{
      id: string
      kind: "custom"
      key: string
      content: string
      sync: boolean
    }>
  | Readonly<{ id: string; kind: "text"; text: string }>

const rowOf = (segment: TicketBlockSegment, id: string): StartingRow => {
  if (segment.kind === "markdown")
    return { id, kind: "text", text: segment.text }
  return segment.content.trim() === ""
    ? { id, kind: "section", key: segment.type }
    : {
        id,
        kind: "custom",
        key: segment.type,
        content: segment.content,
        sync: segment.sync === true
      }
}

const idBase = (segment: TicketBlockSegment): string =>
  segment.kind === "markdown" ? "text" : `section:${segment.type}`

export const startingRows = (body: string): ReadonlyArray<StartingRow> => {
  const seen = new Map<string, number>()
  return parseTicketBlocks(body).map((segment) => {
    const base = idBase(segment)
    const occurrence = seen.get(base) ?? 0
    seen.set(base, occurrence + 1)
    return rowOf(segment, `${base}:${occurrence}`)
  })
}

const segmentOf = (row: StartingRow): TicketBlockSegment => {
  if (row.kind === "text") return { kind: "markdown", text: row.text }
  if (row.kind === "section")
    return { kind: "block", type: row.key, content: "" }
  return row.sync
    ? { kind: "block", type: row.key, content: row.content, sync: true }
    : { kind: "block", type: row.key, content: row.content }
}

export const bodyOfRows = (rows: ReadonlyArray<StartingRow>): string =>
  serializeTicketBlocks(rows.map(segmentOf))

export const moveRow = (
  rows: ReadonlyArray<StartingRow>,
  id: string,
  offset: number
): ReadonlyArray<StartingRow> => {
  const from = rows.findIndex((row) => row.id === id)
  const to = from + offset
  if (from === -1 || to < 0 || to >= rows.length) return rows
  const next = rows.filter((row) => row.id !== id)
  return [...next.slice(0, to), rows[from], ...next.slice(to)]
}

export const withoutRow = (
  rows: ReadonlyArray<StartingRow>,
  id: string
): ReadonlyArray<StartingRow> => rows.filter((row) => row.id !== id)

export const withSection = (
  rows: ReadonlyArray<StartingRow>,
  key: string
): ReadonlyArray<StartingRow> => [
  ...rows,
  { id: `section:${key}:added:${rows.length}`, kind: "section", key }
]

const sectionKeysIn = (rows: ReadonlyArray<StartingRow>): ReadonlySet<string> =>
  new Set(rows.flatMap((row) => (row.kind === "text" ? [] : [row.key])))

export const sectionsToAdd = (
  library: Library,
  rows: ReadonlyArray<StartingRow>
): ReadonlyArray<BlockDefinition> => {
  const present = sectionKeysIn(rows)
  return library.blocks.filter(
    (block) => !block.hidden && !present.has(block.key)
  )
}

const plain = (text: string): string =>
  text
    .replace(/\{\{|\}\}/g, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/\s+/g, " ")
    .trim()

const nodeTexts = (node: BlockOutlineNode): ReadonlyArray<string> =>
  "items" in node ? node.items : [node.text]

export const contentSummary = (content: string): string => {
  const nodes = outlineBlockContent(content)
  const body = nodes[0]?.kind === "heading" ? nodes.slice(1) : nodes
  return body
    .flatMap(nodeTexts)
    .map(plain)
    .filter((text) => text !== "")
    .join(" · ")
}
