export type TicketBlockSegment =
  | Readonly<{ kind: "markdown"; text: string }>
  | Readonly<{ kind: "block"; type: string; content: string; sync?: boolean }>

export const TICKET_BLOCK_TYPE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const TICKET_BLOCK_OPEN =
  /^ {0,3}<block\s+type="([a-z0-9]+(?:-[a-z0-9]+)*)"(\s+sync)?\s*>\s*$/

const TICKET_BLOCK_CLOSE = /^ {0,3}<\/block>\s*$/

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/

const trimBlankLines = (lines: ReadonlyArray<string>): string => {
  let start = 0
  let end = lines.length
  while (start < end && lines[start].trim() === "") start++
  while (end > start && lines[end - 1].trim() === "") end--
  return lines.slice(start, end).join("\n")
}

export type TicketBlockFormatOptions = Readonly<{ sync?: boolean }>

export const formatTicketBlock = (
  type: string,
  content: string,
  options?: TicketBlockFormatOptions
): string => {
  const opener =
    options?.sync === true
      ? `<block type="${type}" sync>`
      : `<block type="${type}">`
  const body = trimBlankLines(content.split("\n"))
  return body === ""
    ? `${opener}\n\n</block>`
    : `${opener}\n\n${body}\n\n</block>`
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

export const advanceFence = (
  line: string,
  fence: string | null
): string | null => {
  if (fence !== null) return closesFence(line, fence) ? null : fence
  const match = FENCE_OPEN.exec(line)
  return match === null ? null : match[1]
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

export const normalizeLineEndings = (text: string): string =>
  text.includes("\r") ? text.replace(/\r\n?/g, "\n") : text

export const parseTicketBlocks = (
  markdown: string
): ReadonlyArray<TicketBlockSegment> => {
  const lines = normalizeLineEndings(markdown).split("\n")
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
      const content = trimBlankLines(lines.slice(i + 1, end))
      segments.push(
        open[2] === undefined
          ? { kind: "block", type: open[1], content }
          : { kind: "block", type: open[1], content, sync: true }
      )
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
        : formatTicketBlock(segment.type, segment.content, {
            sync: segment.sync
          })
    )
    .join("\n\n")

export type BlockIssueCode =
  | "unclosed"
  | "stray_close"
  | "nested"
  | "malformed_open"
  | "invalid_type"

export type BlockIssue = Readonly<{
  line: number
  code: BlockIssueCode
  source: string
}>

const LOOKS_LIKE_BLOCK_OPEN = /^ {0,3}<block\b/

const QUOTED_TYPE_ATTRIBUTE = /^ {0,3}<block\s+type="([^"]*)"/

const classifyBadOpener = (line: string): BlockIssueCode => {
  const quoted = QUOTED_TYPE_ATTRIBUTE.exec(line)
  return quoted !== null && !TICKET_BLOCK_TYPE_PATTERN.test(quoted[1])
    ? "invalid_type"
    : "malformed_open"
}

const issueAt = (
  lines: ReadonlyArray<string>,
  index: number,
  code: BlockIssueCode
): BlockIssue => ({
  line: index + 1,
  code,
  source: lines[index].trim()
})

export const validateTicketBlocks = (
  markdown: string
): ReadonlyArray<BlockIssue> => {
  const lines = markdown.split("\n")
  const issues: Array<BlockIssue> = []
  const openers: Array<number> = []
  let fence: string | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (fence === null) {
      if (TICKET_BLOCK_OPEN.test(line)) {
        if (openers.length > 0) issues.push(issueAt(lines, i, "nested"))
        openers.push(i)
      } else if (TICKET_BLOCK_CLOSE.test(line)) {
        if (openers.pop() === undefined)
          issues.push(issueAt(lines, i, "stray_close"))
      } else if (LOOKS_LIKE_BLOCK_OPEN.test(line)) {
        issues.push(issueAt(lines, i, classifyBadOpener(line)))
      }
    }
    fence = advanceFence(line, fence)
  }
  for (const opener of openers) issues.push(issueAt(lines, opener, "unclosed"))
  return issues.toSorted((a, b) => a.line - b.line)
}

const BLOCK_ISSUE_MESSAGES: Readonly<Record<BlockIssueCode, string>> = {
  unclosed: "is never closed",
  stray_close: "has no matching <block> opener",
  nested: "opens inside another block, and blocks cannot nest",
  malformed_open:
    'is not a valid block opener; write <block type="key"> or <block type="key" sync>',
  invalid_type:
    "has an invalid type; use lowercase kebab-case such as acceptance-criteria"
}

export const formatBlockIssue = (issue: BlockIssue): string =>
  `line ${issue.line}: ${issue.source} ${BLOCK_ISSUE_MESSAGES[issue.code]}`
