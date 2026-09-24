export type TicketBlockSegment =
  | Readonly<{ kind: "markdown"; text: string }>
  | Readonly<{ kind: "block"; type: string; content: string }>

export const TICKET_BLOCK_TYPE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const TICKET_BLOCK_OPEN =
  /^ {0,3}<block\s+type="([a-z0-9]+(?:-[a-z0-9]+)*)"\s*>\s*$/

const TICKET_BLOCK_CLOSE = /^ {0,3}<\/block>\s*$/

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/

const HTML_COMMENT_OPEN = /^ {0,3}<!--/

const HTML_COMMENT = "<!--"

const trimBlankLines = (lines: ReadonlyArray<string>): string => {
  let start = 0
  let end = lines.length
  while (start < end && lines[start].trim() === "") start++
  while (end > start && lines[end - 1].trim() === "") end--
  return lines.slice(start, end).join("\n")
}

export const formatTicketBlock = (type: string, content: string): string => {
  const body = trimBlankLines(content.split("\n"))
  return body === ""
    ? `<block type="${type}">\n\n</block>`
    : `<block type="${type}">\n\n${body}\n\n</block>`
}

const closesFence = (line: string, fence: string): boolean => {
  const match = FENCE_OPEN.exec(line)
  return (
    match !== null &&
    match[1][0] === fence[0] &&
    match[1].length >= fence.length &&
    line.slice(match.index + match[0].length).trim() === ""
  )
}

const opensHtmlComment = (line: string): boolean => {
  const match = HTML_COMMENT_OPEN.exec(line)
  return match !== null && !line.includes("-->", match[0].length - 2)
}

export const advanceFence = (
  line: string,
  fence: string | null
): string | null => {
  if (fence === HTML_COMMENT) return line.includes("-->") ? null : fence
  if (fence !== null) return closesFence(line, fence) ? null : fence
  if (opensHtmlComment(line)) return HTML_COMMENT
  const match = FENCE_OPEN.exec(line)
  return match === null ? null : match[1]
}

export const isInsideFenceOrComment = (
  lines: ReadonlyArray<string>,
  index: number
): boolean => {
  let fence: string | null = null
  for (let i = 0; i < index; i++) fence = advanceFence(lines[i], fence)
  return fence !== null
}

export const findTicketBlockEnd = (
  lines: ReadonlyArray<string>,
  openIndex: number
): number | null => {
  let fence: string | null = null
  for (let i = openIndex + 1; i < lines.length; i++) {
    const line = lines[i]
    if (fence === null) {
      if (TICKET_BLOCK_CLOSE.test(line)) return i
      if (TICKET_BLOCK_OPEN.test(line)) return null
    }
    fence = advanceFence(line, fence)
  }
  return null
}

export const parseTicketBlocks = (
  markdown: string
): ReadonlyArray<TicketBlockSegment> => {
  const lines = markdown.split("\n")
  const segments: Array<TicketBlockSegment> = []
  let pending: Array<string> = []
  let fence: string | null = null

  const flush = () => {
    const text = trimBlankLines(pending)
    if (text !== "") segments.push({ kind: "markdown", text })
    pending = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const open = fence === null ? TICKET_BLOCK_OPEN.exec(line) : null
    const end = open === null ? null : findTicketBlockEnd(lines, i)
    if (open !== null && end !== null) {
      flush()
      segments.push({
        kind: "block",
        type: open[1],
        content: trimBlankLines(lines.slice(i + 1, end))
      })
      i = end
      continue
    }
    pending.push(line)
    fence = advanceFence(line, fence)
  }
  flush()
  return segments
}

export const serializeTicketBlocks = (
  segments: ReadonlyArray<TicketBlockSegment>
): string =>
  segments
    .map((segment) =>
      segment.kind === "markdown"
        ? segment.text
        : formatTicketBlock(segment.type, segment.content)
    )
    .join("\n\n")
