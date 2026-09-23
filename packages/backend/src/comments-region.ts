import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import matter from "gray-matter"

export const COMMENTS_START = "<!-- comments:start -->"
export const COMMENTS_END = "<!-- comments:end -->"
const COMMENT_MARKER = /^<!--\s*comment:([A-Za-z0-9_-]+)\s*-->$/
const FORBIDDEN_BODY = /<!--\s*comment(s)?:/

export type CommentBlock = Readonly<{
  id: string
  author: CommentBlockAuthor
  origin: "native" | "jira"
  createdAt: Date
  editedAt: Date | null
  body: string
}>

export type CommentBlockAuthor =
  | Readonly<{ kind: "user"; userId: string }>
  | Readonly<{
      kind: "jira"
      displayName: string
      accountId: string
    }>

const CommentBlockDate = Schema.Union([Schema.DateFromString, Schema.Date])
const decodeEditedAt = (value: unknown): Date | null => {
  if (value == null) return null
  return Option.getOrNull(Schema.decodeUnknownOption(CommentBlockDate)(value))
}
const UserBlockAuthor = Schema.Struct({
  kind: Schema.Literal("user"),
  userId: Schema.NonEmptyString
})
const JiraBlockAuthor = Schema.Struct({
  kind: Schema.Literal("jira"),
  displayName: Schema.NonEmptyString,
  accountId: Schema.NonEmptyString
})
const LegacyCommentData = Schema.Struct({
  author: Schema.NonEmptyString,
  createdAt: CommentBlockDate,
  editedAt: Schema.optionalKey(Schema.Unknown)
})
const NativeCommentData = Schema.Struct({
  author: UserBlockAuthor,
  origin: Schema.Literal("native"),
  createdAt: CommentBlockDate,
  editedAt: Schema.optionalKey(Schema.Unknown)
})
const LinkedJiraCommentData = Schema.Struct({
  author: UserBlockAuthor,
  origin: Schema.Literal("jira"),
  createdAt: CommentBlockDate,
  editedAt: Schema.optionalKey(Schema.Unknown)
})
const SnapshotJiraCommentData = Schema.Struct({
  author: JiraBlockAuthor,
  origin: Schema.Literal("jira"),
  createdAt: CommentBlockDate,
  editedAt: Schema.optionalKey(Schema.Unknown)
})
const CommentBlockData = Schema.Union([
  LegacyCommentData,
  NativeCommentData,
  LinkedJiraCommentData,
  SnapshotJiraCommentData
])

export type ValidationResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; reason: string }>

export function validateCommentBody(body: string): ValidationResult {
  if (!body.trim()) return { ok: false, reason: "empty" }
  if (FORBIDDEN_BODY.test(body)) {
    return { ok: false, reason: "contains_marker_pattern" }
  }
  return { ok: true }
}

export function splitDescriptionAndCommentsRegion(full: string): Readonly<{
  description: string
  region: string
}> {
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
    const decoded = Schema.decodeUnknownOption(CommentBlockData)(parsed.data)
    if (Option.isSome(decoded)) {
      const data = decoded.value
      let author: CommentBlockAuthor
      let origin: CommentBlock["origin"]
      if ("origin" in data) {
        author = data.author
        origin = data.origin
      } else {
        author = { kind: "user", userId: data.author }
        origin = "native"
      }
      blocks.push({
        id,
        author,
        origin,
        createdAt: data.createdAt,
        editedAt: decodeEditedAt(data.editedAt),
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
      origin: b.origin,
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
