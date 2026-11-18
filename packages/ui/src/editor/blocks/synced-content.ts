import {
  mergeChecklistTicks,
  stripHints,
  type BlockDefinition,
  type BlockLookup
} from "@pp/shared"
import * as Data from "effect/Data"

export type SyncedBlockMode = "synced" | "reference"

export type SyncedView = Data.TaggedEnum<{
  live: { readonly content: string; readonly definition: BlockDefinition }
  removed: { readonly content: string }
}>
export const SyncedView = Data.taggedEnum<SyncedView>()

const liveDefinition = (
  lookup: BlockLookup,
  blockType: string,
  mode: SyncedBlockMode
) => {
  const definition = lookup(blockType)
  if (definition === undefined || definition.hidden) return undefined
  return mode === "reference" || definition.sync ? definition : undefined
}

export const syncedView = (
  lookup: BlockLookup,
  blockType: string,
  snapshot: string,
  mode: SyncedBlockMode
) => {
  const definition = liveDefinition(lookup, blockType, mode)
  if (definition === undefined) return SyncedView.removed({ content: snapshot })
  return SyncedView.live({
    definition,
    content:
      mode === "reference"
        ? stripHints(definition.content)
        : mergeChecklistTicks(definition.content, snapshot)
  })
}

const HINT = /\{\{([^{}\n]+)\}\}/g

// Bare hint markers would render `- [ ]` as literal text instead of a checkbox.
export const hintsAsEmphasis = (markdown: string) =>
  markdown.replace(HINT, (_, text: string) => `*${text.trim()}*`)

/** What a synced or linked block shows: references show the hints. */
export const syncedDisplayContent = (
  view: Data.TaggedEnum.Value<SyncedView, "live">,
  mode: SyncedBlockMode
) =>
  mode === "reference" ? hintsAsEmphasis(view.definition.content) : view.content

const TASK_MARK = /^(\s*(?:[-*+]|\d{1,9}[.)])\s+\[)([ xX])\]/

export const toggleTaskAtLine = (content: string, line: number) => {
  const lines = content.split("\n")
  const target = lines[line - 1]
  const task = target === undefined ? null : TASK_MARK.exec(target)
  if (task === null) return content
  const mark = task[2] === " " ? "x" : " "
  lines[line - 1] = `${task[1]}${mark}]${target.slice(task[0].length)}`
  return lines.join("\n")
}

const HEADING_LINE = /^ {0,3}#{1,6}(?:\s|$)/

export type LeadingHeading = Readonly<{ heading: string | null; rest: string }>

export const splitLeadingHeading = (content: string) => {
  const lines = content.split("\n")
  const first = lines.findIndex((line) => line.trim() !== "")
  if (first === -1 || !HEADING_LINE.test(lines[first]))
    return { heading: null, rest: content } satisfies LeadingHeading
  return {
    heading: lines[first],
    rest: lines.slice(first + 1).join("\n")
  } satisfies LeadingHeading
}
