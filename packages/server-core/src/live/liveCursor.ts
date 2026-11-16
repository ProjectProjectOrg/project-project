import { GroupId, type LiveChange, type LiveCursor, TicketId } from "@pp/shared"

import type { SyncPosition } from "../sync/SyncLog"
import type { LiveEntry } from "./LiveChanges"

export type LiveVector = ReadonlyMap<string, SyncPosition>

const SEPARATOR = "~"

export const encodeCursor = (vector: LiveVector): LiveCursor =>
  [...vector]
    .map(([projectId, { generation, sequence }]) =>
      [projectId, generation, sequence].join(".")
    )
    .join(SEPARATOR)

export const decodeCursor = (
  cursor: LiveCursor
): Map<string, SyncPosition> | null => {
  const vector = new Map<string, SyncPosition>()
  if (cursor === "") return vector
  for (const part of cursor.split(SEPARATOR)) {
    const [projectId, generation, sequence] = part.split(".")
    const position = {
      generation: Number(generation),
      sequence: Number(sequence)
    }
    if (
      projectId === undefined ||
      projectId === "" ||
      !Number.isSafeInteger(position.generation) ||
      !Number.isSafeInteger(position.sequence)
    )
      return null
    vector.set(projectId, position)
  }
  return vector
}

export const isNewer = (vector: LiveVector, entry: LiveEntry) => {
  const known = vector.get(entry.projectId)
  return (
    known === undefined ||
    known.generation !== entry.generation ||
    entry.sequence > known.sequence
  )
}

export const changesOf = (
  entry: LiveEntry,
  cursor: LiveCursor
): ReadonlyArray<LiveChange> => {
  const base = {
    orgSlug: entry.orgSlug,
    slug: entry.slug,
    origin: entry.origin,
    cursor
  }
  if (entry.reset) return [{ ...base, kind: "tickets" }]
  const changes: Array<LiveChange> = []
  let wholeProject = false
  for (const ref of entry.changes) {
    if (ref.kind === "ticket")
      changes.push({ ...base, kind: "ticket", id: TicketId.make(ref.id) })
    else if (ref.kind === "group")
      changes.push({ ...base, kind: "group", id: GroupId.make(ref.id) })
    else if (ref.kind === "comments")
      changes.push({
        ...base,
        kind: "comments",
        ticketId: TicketId.make(ref.id)
      })
    else wholeProject = true
  }
  return wholeProject ? [...changes, { ...base, kind: "tickets" }] : changes
}
