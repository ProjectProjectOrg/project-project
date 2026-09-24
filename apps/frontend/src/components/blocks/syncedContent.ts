import {
  mergeChecklistTicks,
  type BlockDefinition,
  type BlockLookup
} from "@pp/shared"

export type SyncedView =
  | Readonly<{ kind: "live"; content: string; definition: BlockDefinition }>
  | Readonly<{ kind: "removed"; content: string }>

const liveDefinition = (
  lookup: BlockLookup,
  blockType: string
): BlockDefinition | undefined => {
  const definition = lookup(blockType)
  if (definition === undefined || definition.hidden) return undefined
  return definition.sync ? definition : undefined
}

export const syncedView = (
  lookup: BlockLookup,
  blockType: string,
  snapshot: string
): SyncedView => {
  const definition = liveDefinition(lookup, blockType)
  if (definition === undefined) return { kind: "removed", content: snapshot }
  return {
    kind: "live",
    definition,
    content: mergeChecklistTicks(definition.content, snapshot)
  }
}

const TASK_MARK = /^(\s*(?:[-*+]|\d{1,9}[.)])\s+\[)([ xX])\]/

export const toggleTaskAtLine = (content: string, line: number): string => {
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

export const splitLeadingHeading = (content: string): LeadingHeading => {
  const lines = content.split("\n")
  const first = lines.findIndex((line) => line.trim() !== "")
  if (first === -1 || !HEADING_LINE.test(lines[first]))
    return { heading: null, rest: content }
  return { heading: lines[first], rest: lines.slice(first + 1).join("\n") }
}
