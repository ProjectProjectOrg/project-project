import {
  outlineBlockContent,
  parseTicketBlocks,
  serializeTicketBlocks,
  BlockOutlineNode,
  type Library,
  TicketBlockSegment
} from "@pp/shared"
import * as Data from "effect/Data"

export type StartingRow = Data.TaggedEnum<{
  section: Readonly<{ id: string; key: string }>
  custom: Readonly<{
    id: string
    key: string
    content: string
    sync: boolean
  }>
  text: Readonly<{ id: string; text: string }>
}>
export const StartingRow = Data.taggedEnum<StartingRow>()

const rowOf = (segment: TicketBlockSegment, id: string) => {
  if (TicketBlockSegment.$is("markdown")(segment))
    return StartingRow.text({ id, text: segment.text })
  return segment.content.trim() === ""
    ? StartingRow.section({ id, key: segment.type })
    : StartingRow.custom({
        id,
        key: segment.type,
        content: segment.content,
        sync: segment.sync === true
      })
}

const idBase = (segment: TicketBlockSegment) =>
  TicketBlockSegment.$is("markdown")(segment)
    ? "text"
    : `section:${segment.type}`

export const startingRows = (body: string) => {
  const seen = new Map<string, number>()
  return parseTicketBlocks(body).map((segment) => {
    const base = idBase(segment)
    const occurrence = seen.get(base) ?? 0
    seen.set(base, occurrence + 1)
    return rowOf(segment, `${base}:${occurrence}`)
  })
}

const segmentOf = (row: StartingRow) =>
  StartingRow.$match(row, {
    text: ({ text }) => TicketBlockSegment.markdown({ text }),
    section: ({ key }) => TicketBlockSegment.block({ type: key, content: "" }),
    custom: ({ key, content, sync }) =>
      sync
        ? TicketBlockSegment.block({ type: key, content, sync: true })
        : TicketBlockSegment.block({ type: key, content })
  })

export const bodyOfRows = (rows: ReadonlyArray<StartingRow>) =>
  serializeTicketBlocks(rows.map(segmentOf))

export const moveRow = (
  rows: ReadonlyArray<StartingRow>,
  id: string,
  offset: number
) => {
  const from = rows.findIndex((row) => row.id === id)
  const to = from + offset
  if (from === -1 || to < 0 || to >= rows.length) return rows
  const next = rows.filter((row) => row.id !== id)
  return [...next.slice(0, to), rows[from], ...next.slice(to)]
}

export const withoutRow = (rows: ReadonlyArray<StartingRow>, id: string) =>
  rows.filter((row) => row.id !== id)

export const withSection = (rows: ReadonlyArray<StartingRow>, key: string) => [
  ...rows,
  StartingRow.section({ id: `section:${key}:added:${rows.length}`, key })
]

const sectionKeysIn = (rows: ReadonlyArray<StartingRow>) =>
  new Set(
    rows.flatMap((row) => (StartingRow.$is("text")(row) ? [] : [row.key]))
  )

export const sectionsToAdd = (
  library: Library,
  rows: ReadonlyArray<StartingRow>
) => {
  const present = sectionKeysIn(rows)
  return library.blocks.filter(
    (block) => !block.hidden && !present.has(block.key)
  )
}

const plain = (text: string) =>
  text
    .replace(/\{\{|\}\}/g, "")
    .replace(/\*\*|__|`/g, "")
    .replace(/\s+/g, " ")
    .trim()

const nodeTexts = (node: BlockOutlineNode) =>
  BlockOutlineNode.$is("list")(node) ? node.items : [node.text]

export const contentSummary = (content: string) => {
  const nodes = outlineBlockContent(content)
  const body = nodes[0]?.kind === "heading" ? nodes.slice(1) : nodes
  return body
    .flatMap(nodeTexts)
    .map(plain)
    .filter((text) => text !== "")
    .join(" · ")
}
