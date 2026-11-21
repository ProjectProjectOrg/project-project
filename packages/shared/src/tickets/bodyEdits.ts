import * as Result from "effect/Result"
import * as Schema from "effect/Schema"

import {
  advanceFence,
  BlockIssue,
  findTicketBlockEnd,
  normalizeLineEndings,
  TICKET_BLOCK_OPEN,
  TICKET_BLOCK_TYPE_PATTERN,
  validateTicketBlocks
} from "./blocks"

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

export const TicketBodyEditFailure = Schema.TaggedUnion({
  NoMatch: {},
  MultipleMatches: { count: Schema.Int },
  BlockNotFound: {},
  BlockAmbiguous: { count: Schema.Int },
  BlockSynced: {},
  BlockMarkup: { issue: BlockIssue }
})
export type TicketBodyEditFailure = typeof TicketBodyEditFailure.Type

const { NoMatch, MultipleMatches, BlockNotFound, BlockAmbiguous, BlockSynced } =
  TicketBodyEditFailure.cases

const failEdit = (failure: TicketBodyEditFailure) => Result.fail(failure)

const failAt = (index: number, failure: TicketBodyEditFailure) =>
  Result.fail({ index, failure })

type BlockSpan = Readonly<{
  open: number
  end: number
  type: string
  sync: boolean
}>

const trimBlankLines = (text: string) =>
  text.replace(/^(?:[ \t]*\n)+|(?:\n[ \t]*)+$/g, "")

const countOccurrences = (text: string, search: string) =>
  text.split(search).length - 1

const replaceText = (body: string, edit: typeof ReplaceTextEdit.Type) => {
  const oldText = normalizeLineEndings(edit.oldText)
  const newText = normalizeLineEndings(edit.newText)
  const count = countOccurrences(body, oldText)
  if (count === 0) return failEdit(NoMatch.make({}))
  if (count > 1 && edit.replaceAll !== true)
    return failEdit(MultipleMatches.make({ count }))
  return Result.succeed(body.split(oldText).join(newText))
}

const append = (body: string, edit: typeof AppendEdit.Type) => {
  const head = body.trimEnd()
  const text = trimBlankLines(normalizeLineEndings(edit.text))
  return Result.succeed(head === "" ? text : `${head}\n\n${text}`)
}

const blockSpans = (lines: ReadonlyArray<string>) => {
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

const replaceBlock = (body: string, edit: typeof ReplaceBlockEdit.Type) => {
  const lines = body.split("\n")
  const matches = blockSpans(lines).filter((span) => span.type === edit.type)
  if (matches.length === 0) return failEdit(BlockNotFound.make({}))
  if (matches.length > 1)
    return failEdit(BlockAmbiguous.make({ count: matches.length }))
  const [span] = matches
  if (span.sync) return failEdit(BlockSynced.make({}))
  const content = trimBlankLines(normalizeLineEndings(edit.content))
  const inner = content === "" ? [""] : ["", ...content.split("\n"), ""]
  return Result.succeed(
    [...lines.slice(0, span.open + 1), ...inner, ...lines.slice(span.end)].join(
      "\n"
    )
  )
}

const applyEdit = (body: string, edit: TicketBodyEdit) => {
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
) => {
  let current = normalizeLineEndings(body)
  const checkMarkup = validateTicketBlocks(current).length === 0
  for (const [index, edit] of edits.entries()) {
    const outcome = applyEdit(current, edit)
    if (Result.isFailure(outcome)) return failAt(index, outcome.failure)
    const [issue] = checkMarkup ? validateTicketBlocks(outcome.success) : []
    if (issue !== undefined) {
      const failure = TicketBodyEditFailure.cases.BlockMarkup.make({ issue })
      return failAt(index, failure)
    }
    current = outcome.success
  }
  return Result.succeed(current)
}
