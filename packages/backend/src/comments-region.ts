import matter from "gray-matter"

export const COMMENTS_START = "<!-- comments:start -->"
export const COMMENTS_END = "<!-- comments:end -->"
const COMMENT_MARKER = /^<!--\s*comment:([A-Za-z0-9_-]+)\s*-->$/
const FORBIDDEN_BODY = /<!--\s*comment(s)?:/

export interface CommentBlock {
  readonly id: string
  readonly author: string
  readonly createdAt: Date
  readonly editedAt: Date | null
  readonly body: string
}

export type ValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string }

export function validateCommentBody(body: string): ValidationResult {
  if (!body.trim()) return { ok: false, reason: "empty" }
  if (FORBIDDEN_BODY.test(body)) {
    return { ok: false, reason: "contains_marker_pattern" }
  }
  return { ok: true }
}

export function splitDescriptionAndCommentsRegion(full: string): {
  description: string
  region: string
} {
  const idx = full.indexOf(COMMENTS_START)
  if (idx === -1) return { description: full, region: "" }
  const before = full.slice(0, idx)
  const description = before.replace(/\n{3,}$/, "\n")
  const region = full.slice(idx)
  return { description, region }
}

export function parseCommentsRegion(
  region: string
): ReadonlyArray<CommentBlock> {
  if (!region.trim()) return []
  const inner = stripOuterMarkers(region)
  if (inner === null) return []

  const lines = inner.split("\n")
  const blocks: CommentBlock[] = []
  let i = 0
  while (i < lines.length) {
    const headerMatch = COMMENT_MARKER.exec(lines[i].trim())
    if (!headerMatch) {
      i++
      continue
    }
    const id = headerMatch[1]
    i++
    let end = i
    while (end < lines.length && !COMMENT_MARKER.test(lines[end].trim())) end++
    const blockText = lines.slice(i, end).join("\n").trim()
    const parsed = matter(blockText)
    const data = parsed.data as Record<string, unknown>
    const author = typeof data.author === "string" ? data.author : null
    const createdAt = parseDate(data.createdAt)
    const editedAt = parseDate(data.editedAt)
    if (author && createdAt) {
      blocks.push({
        id,
        author,
        createdAt,
        editedAt,
        body: parsed.content.replace(/^\n+/, "").replace(/\s+$/, "")
      })
    }
    i = end
  }
  return blocks
}

export function serializeCommentsRegion(
  blocks: ReadonlyArray<CommentBlock>
): string {
  if (blocks.length === 0) return ""
  const out: string[] = [COMMENTS_START]
  for (const b of blocks) {
    const fm: Record<string, unknown> = {
      author: b.author,
      createdAt: b.createdAt.toISOString()
    }
    if (b.editedAt) fm.editedAt = b.editedAt.toISOString()
    out.push(`<!-- comment:${b.id} -->`)
    out.push(matter.stringify(b.body.replace(/\s+$/, "") + "\n", fm).trimEnd())
  }
  out.push(COMMENTS_END)
  return out.join("\n") + "\n"
}

function stripOuterMarkers(region: string): string | null {
  const start = region.indexOf(COMMENTS_START)
  const end = region.lastIndexOf(COMMENTS_END)
  if (start === -1 || end === -1 || end <= start) return null
  return region.slice(start + COMMENTS_START.length, end)
}

function parseDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : null
  if (typeof v === "string") {
    const d = new Date(v)
    return Number.isFinite(d.getTime()) ? d : null
  }
  return null
}
