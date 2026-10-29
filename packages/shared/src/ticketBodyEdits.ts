import * as Schema from "effect/Schema"

import {
  advanceFence,
  findTicketBlockEnd,
  formatBlockIssue,
  normalizeLineEndings,
  TICKET_BLOCK_OPEN,
  TICKET_BLOCK_TYPE_PATTERN,
  validateTicketBlocks
} from "./ticketBlocks"

export const TICKET_BODY_EDITS_MAX = 50

const NonEmptyText = Schema.String.pipe(Schema.check(Schema.isMinLength(1)))

export const ReplaceTextEdit = Schema.Struct({
  kind: Schema.Literal("replace"),
  oldText: NonEmptyText,
  newText: Schema.String,
  replaceAll: Schema.optional(Schema.Boolean)
})

export const AppendEdit = Schema.Struct({
  kind: Schema.Literal("append"),
  text: NonEmptyText
})

export const ReplaceBlockEdit = Schema.Struct({
  kind: Schema.Literal("replace_block"),
  type: Schema.String.pipe(
    Schema.check(Schema.isPattern(TICKET_BLOCK_TYPE_PATTERN))
  ),
  content: Schema.String
})

export const TicketBodyEdit = Schema.Union([
  ReplaceTextEdit,
  AppendEdit,
  ReplaceBlockEdit
])
export type TicketBodyEdit = typeof TicketBodyEdit.Type

export const TicketBodyEdits = Schema.Array(TicketBodyEdit).pipe(
  Schema.check(Schema.isMinLength(1)),
  Schema.check(Schema.isMaxLength(TICKET_BODY_EDITS_MAX))
)

export type TicketBodyEditFailure =
  | Readonly<{ code: "no_match" }>
  | Readonly<{ code: "multiple_matches"; count: number }>
  | Readonly<{ code: "block_not_found" }>
  | Readonly<{ code: "block_ambiguous"; count: number }>
  | Readonly<{ code: "block_synced" }>
  | Readonly<{ code: "block_markup"; issue: string }>

export type TicketBodyEditsResult =
  | Readonly<{ ok: true; body: string }>
  | Readonly<{ ok: false; index: number; failure: TicketBodyEditFailure }>

type EditOutcome =
  | Readonly<{ ok: true; body: string }>
  | Readonly<{ ok: false; failure: TicketBodyEditFailure }>

type BlockSpan = Readonly<{
  open: number
  end: number
  type: string
  sync: boolean
}>

const trimBlankLines = (text: string): string =>
  text.replace(/^(?:[ \t]*\n)+|(?:\n[ \t]*)+$/g, "")

const countOccurrences = (text: string, search: string): number =>
  text.split(search).length - 1

const replaceText = (
  body: string,
  edit: typeof ReplaceTextEdit.Type
): EditOutcome => {
  const oldText = normalizeLineEndings(edit.oldText)
  const newText = normalizeLineEndings(edit.newText)
  const count = countOccurrences(body, oldText)
  if (count === 0) return { ok: false, failure: { code: "no_match" } }
  if (count > 1 && edit.replaceAll !== true) {
    return { ok: false, failure: { code: "multiple_matches", count } }
  }
  return { ok: true, body: body.split(oldText).join(newText) }
}

const append = (body: string, edit: typeof AppendEdit.Type): EditOutcome => {
  const head = body.trimEnd()
  const text = trimBlankLines(normalizeLineEndings(edit.text))
  return { ok: true, body: head === "" ? text : `${head}\n\n${text}` }
}

const blockSpans = (lines: ReadonlyArray<string>): ReadonlyArray<BlockSpan> => {
  const spans: Array<BlockSpan> = []
  let fence: string | null = null
  for (let i = 0; i < lines.length; i++) {
    const open = fence === null ? TICKET_BLOCK_OPEN.exec(lines[i]) : null
    const end = open === null ? null : findTicketBlockEnd(lines, i)
    if (open !== null && end !== null) {
      spans.push({ open: i, end, type: open[1], sync: open[2] !== undefined })
      i = end
      continue
    }
    fence = advanceFence(lines[i], fence)
  }
  return spans
}

const replaceBlock = (
  body: string,
  edit: typeof ReplaceBlockEdit.Type
): EditOutcome => {
  const lines = body.split("\n")
  const matches = blockSpans(lines).filter((span) => span.type === edit.type)
  if (matches.length === 0) {
    return { ok: false, failure: { code: "block_not_found" } }
  }
  if (matches.length > 1) {
    return {
      ok: false,
      failure: { code: "block_ambiguous", count: matches.length }
    }
  }
  const [span] = matches
  if (span.sync) return { ok: false, failure: { code: "block_synced" } }
  const content = trimBlankLines(normalizeLineEndings(edit.content))
  const inner = content === "" ? [""] : ["", ...content.split("\n"), ""]
  return {
    ok: true,
    body: [
      ...lines.slice(0, span.open + 1),
      ...inner,
      ...lines.slice(span.end)
    ].join("\n")
  }
}

const applyEdit = (body: string, edit: TicketBodyEdit): EditOutcome => {
  switch (edit.kind) {
    case "replace":
      return replaceText(body, edit)
    case "append":
      return append(body, edit)
    case "replace_block":
      return replaceBlock(body, edit)
  }
}

export const applyTicketBodyEdits = (
  body: string,
  edits: ReadonlyArray<TicketBodyEdit>
): TicketBodyEditsResult => {
  let current = normalizeLineEndings(body)
  const checkMarkup = validateTicketBlocks(current).length === 0
  for (const [index, edit] of edits.entries()) {
    const outcome = applyEdit(current, edit)
    if (!outcome.ok) return { ok: false, index, failure: outcome.failure }
    const [issue] = checkMarkup ? validateTicketBlocks(outcome.body) : []
    if (issue !== undefined) {
      return {
        ok: false,
        index,
        failure: { code: "block_markup", issue: formatBlockIssue(issue) }
      }
    }
    current = outcome.body
  }
  return { ok: true, body: current }
}

export const formatTicketBodyEditFailure = (
  failure: TicketBodyEditFailure
): string => {
  switch (failure.code) {
    case "no_match":
      return "no_match"
    case "multiple_matches":
      return `multiple_matches:${failure.count}`
    case "block_not_found":
      return "block_not_found"
    case "block_ambiguous":
      return `block_ambiguous:${failure.count}`
    case "block_synced":
      return "block_synced"
    case "block_markup":
      return `block_markup:${failure.issue}`
  }
}
