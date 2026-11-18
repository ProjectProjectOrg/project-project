import { type CommentOrigin, ImportedAuthor } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"

import { markdownFileContent, parseMarkdownFile } from "../markdown/fileContent"

export const COMMENTS_START = "<!-- comments:start -->"
export const COMMENTS_END = "<!-- comments:end -->"
const COMMENT_MARKER = /^<!--\s*comment:([A-Za-z0-9_-]+)\s*-->$/
const FORBIDDEN_BODY = /<!--\s*comment(s)?:/

export type CommentBlock = Readonly<{
  id: string
  author: CommentBlockAuthor
  origin: CommentOrigin
  createdAt: Date
  editedAt: Date | null
  replyTo?: string
  resolvedBy?: string
  resolvedAt?: Date
  tickets?: ReadonlyArray<string>
  body: string
}>

export type CommentBlockAuthor =
  | Readonly<{ kind: "user"; userId: string }>
  | ImportedAuthor

const CommentBlockDate = Schema.Union([Schema.DateFromString, Schema.Date])

const EditedAt = Schema.NullOr(CommentBlockDate).pipe(
  Schema.catchDecoding(() => Effect.succeed(Option.some(null))),
  Schema.withDecodingDefaultTypeKey(Effect.succeed(null))
)
const ReplyTo = Schema.NullOr(
  Schema.String.pipe(Schema.check(Schema.isPattern(/^c_[A-Za-z0-9_-]+$/u)))
).pipe(
  Schema.catchDecoding(() => Effect.succeed(Option.some(null))),
  Schema.withDecodingDefaultTypeKey(Effect.succeed(null))
)
const ResolvedBy = Schema.NullOr(Schema.NonEmptyString).pipe(
  Schema.catchDecoding(() => Effect.succeed(Option.some(null))),
  Schema.withDecodingDefaultTypeKey(Effect.succeed(null))
)
const ResolvedAt = Schema.NullOr(CommentBlockDate).pipe(
  Schema.catchDecoding(() => Effect.succeed(Option.some(null))),
  Schema.withDecodingDefaultTypeKey(Effect.succeed(null))
)
const Tickets = Schema.Array(Schema.NonEmptyString).pipe(
  Schema.catchDecoding(() => Effect.succeed(Option.some([]))),
  Schema.withDecodingDefaultTypeKey(Effect.succeed([]))
)
const UserBlockAuthor = Schema.Struct({
  kind: Schema.Literal("user"),
  userId: Schema.NonEmptyString
})
const LegacyJiraBlockAuthor = Schema.Struct({
  kind: Schema.Literal("jira"),
  displayName: Schema.NonEmptyString,
  accountId: Schema.NonEmptyString
})
const LegacyCommentData = Schema.Struct({
  author: Schema.NonEmptyString,
  createdAt: CommentBlockDate,
  editedAt: EditedAt,
  replyTo: ReplyTo,
  resolvedBy: ResolvedBy,
  resolvedAt: ResolvedAt,
  tickets: Tickets
})
const NativeCommentData = Schema.Struct({
  author: UserBlockAuthor,
  origin: Schema.Literal("native"),
  createdAt: CommentBlockDate,
  editedAt: EditedAt,
  replyTo: ReplyTo,
  resolvedBy: ResolvedBy,
  resolvedAt: ResolvedAt,
  tickets: Tickets
})
const ImportedCommentData = Schema.Struct({
  author: Schema.Union([UserBlockAuthor, ImportedAuthor]),
  origin: Schema.Literals(["jira", "projectproject"]),
  createdAt: CommentBlockDate,
  editedAt: EditedAt,
  replyTo: ReplyTo,
  resolvedBy: ResolvedBy,
  resolvedAt: ResolvedAt,
  tickets: Tickets
})
const LegacyJiraSnapshotCommentData = Schema.Struct({
  author: LegacyJiraBlockAuthor,
  origin: Schema.Literal("jira"),
  createdAt: CommentBlockDate,
  editedAt: EditedAt,
  replyTo: ReplyTo,
  resolvedBy: ResolvedBy,
  resolvedAt: ResolvedAt,
  tickets: Tickets
})
const CommentBlockData = Schema.Union([
  LegacyCommentData,
  NativeCommentData,
  ImportedCommentData,
  LegacyJiraSnapshotCommentData
])

const blockAuthor = (author: (typeof CommentBlockData.Type)["author"]) => {
  if (Predicate.isString(author))
    return { kind: "user", userId: author } satisfies CommentBlockAuthor
  if (author.kind !== "jira") return author
  return {
    kind: "imported",
    displayName: author.displayName,
    source: "jira",
    sourceId: author.accountId
  } satisfies CommentBlockAuthor
}

const decodeUnknownCommentBlockDataOption =
  Schema.decodeUnknownOption(CommentBlockData)

export type ValidationResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; reason: string }>

export function validateCommentBody(body: string) {
  if (!body.trim())
    return { ok: false, reason: "empty" } satisfies ValidationResult
  if (FORBIDDEN_BODY.test(body)) {
    return {
      ok: false,
      reason: "contains_marker_pattern"
    } satisfies ValidationResult
  }
  return { ok: true } satisfies ValidationResult
}

export function splitDescriptionAndCommentsRegion(full: string) {
  const idx = full.indexOf(COMMENTS_START)
  if (idx === -1) return { description: full, region: "" }
  const before = full.slice(0, idx)
  const description = before.replace(/\n{3,}$/, "\n")
  const region = full.slice(idx)
  return { description, region }
}

export function parseCommentsRegion(region: string) {
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
    const parsed = parseMarkdownFile(blockText)
    const decoded = decodeUnknownCommentBlockDataOption(parsed.data)
    if (Option.isSome(decoded)) {
      const data = decoded.value
      blocks.push({
        id,
        author: blockAuthor(data.author),
        origin: "origin" in data ? data.origin : "native",
        createdAt: data.createdAt,
        editedAt: data.editedAt,
        ...(data.replyTo === null ? {} : { replyTo: data.replyTo }),
        ...(data.resolvedBy === null || data.resolvedAt === null
          ? {}
          : { resolvedBy: data.resolvedBy, resolvedAt: data.resolvedAt }),
        ...(data.tickets.length === 0 ? {} : { tickets: data.tickets }),
        body: parsed.content.replace(/^\n+/, "").replace(/\s+$/, "")
      })
    }
    i = end
  }
  return blocks
}

export function serializeCommentsRegion(blocks: ReadonlyArray<CommentBlock>) {
  if (blocks.length === 0) return ""
  const out: string[] = [COMMENTS_START]
  for (const b of blocks) {
    const fm: Record<string, unknown> = {
      author: b.author,
      origin: b.origin,
      createdAt: b.createdAt.toISOString()
    }
    if (b.editedAt) fm.editedAt = b.editedAt.toISOString()
    if (b.replyTo) fm.replyTo = b.replyTo
    if (b.resolvedBy && b.resolvedAt) {
      fm.resolvedBy = b.resolvedBy
      fm.resolvedAt = b.resolvedAt.toISOString()
    }
    if (b.tickets && b.tickets.length > 0) fm.tickets = b.tickets
    out.push(`<!-- comment:${b.id} -->`)
    out.push(
      markdownFileContent(fm, b.body.replace(/\s+$/, "") + "\n").trimEnd()
    )
  }
  out.push(COMMENTS_END)
  return out.join("\n") + "\n"
}

function stripOuterMarkers(region: string) {
  const start = region.indexOf(COMMENTS_START)
  const end = region.lastIndexOf(COMMENTS_END)
  if (start === -1 || end === -1 || end <= start) return null
  return region.slice(start + COMMENTS_START.length, end)
}
