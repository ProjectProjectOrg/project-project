import { type MergeConflict, mergeDescriptions } from "@pp/local"
import * as Match from "effect/Match"

export type IncomingDescription =
  | Readonly<{ kind: "none" }>
  | Readonly<{ kind: "adopt" }>
  | Readonly<{ kind: "reload" }>
  | Readonly<{ kind: "replace"; body: string }>
  | Readonly<{ kind: "conflict"; conflicts: ReadonlyArray<MergeConflict> }>

const sameMarkdown = (a: string, b: string): boolean => a.trim() === b.trim()

export const incomingDescription = ({
  incoming,
  loaded,
  current,
  idle,
  uploading
}: Readonly<{
  incoming: string
  loaded: string
  current: string | null
  idle: boolean
  uploading: boolean
}>): IncomingDescription => {
  if (incoming === loaded) return { kind: "none" }
  if (idle) return { kind: "reload" }
  if (current === null || sameMarkdown(current, incoming))
    return { kind: "adopt" }
  if (sameMarkdown(current, loaded)) return { kind: "replace", body: incoming }
  if (uploading) return { kind: "conflict", conflicts: [] }
  return Match.valueTags(mergeDescriptions(loaded, current, incoming), {
    Merged: ({ body }): IncomingDescription => ({ kind: "replace", body }),
    Conflict: ({ conflicts }): IncomingDescription => ({
      kind: "conflict",
      conflicts
    })
  })
}
