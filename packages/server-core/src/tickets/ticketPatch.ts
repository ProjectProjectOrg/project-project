import type { TicketPolicy } from "@pp/access/policies"
import type { UpdateTicketInput } from "@pp/shared"
import * as Equal from "effect/Equal"

import type { TicketDocument } from "./TicketDocs"
import type { HierarchyChange } from "./ticketHierarchy"

export type TicketPatch = UpdateTicketInput

const listChanged = (
  next: ReadonlyArray<string>,
  current: ReadonlyArray<string>
) =>
  next.length !== current.length ||
  next.some((value, index) => value !== current[index])

export const applyTicketPatch = (
  existing: TicketDocument,
  patch: TicketPatch,
  actor: string,
  now: Date
): TicketDocument => ({
  ...existing,
  title: patch.title ?? existing.title,
  status: patch.status ?? existing.status,
  type: patch.type ?? existing.type,
  parent:
    patch.parent === undefined ? existing.parent : (patch.parent ?? undefined),
  priority: patch.priority ?? existing.priority,
  estimate:
    patch.estimate === undefined
      ? existing.estimate
      : (patch.estimate ?? undefined),
  tags: patch.tags === undefined ? existing.tags : [...patch.tags],
  assignees:
    patch.assignees === undefined ? existing.assignees : [...patch.assignees],
  updatedBy: actor,
  updatedAt: now,
  body: patch.body ?? existing.body
})

export const fieldChangesOf = (
  existing: TicketDocument,
  next: TicketDocument
): TicketPolicy.Change => ({
  content:
    next.title !== existing.title ||
    next.type !== existing.type ||
    next.priority !== existing.priority ||
    next.parent !== existing.parent ||
    !Equal.equals(next.estimate, existing.estimate) ||
    next.body !== existing.body ||
    listChanged(next.tags, existing.tags),
  status: next.status !== existing.status,
  assignees: listChanged(next.assignees, existing.assignees)
})

export const isUnchanged = (change: TicketPolicy.Change) =>
  !change.content && !change.status && !change.assignees

export const ticketChangeOf = (
  existing: TicketDocument,
  next: TicketDocument
): TicketPolicy.Change => {
  const change = fieldChangesOf(existing, next)
  return isUnchanged(change) ? { ...change, content: true } : change
}

export const batchChangeOf = (
  changes: ReadonlyArray<TicketPolicy.Change>
): TicketPolicy.Change => {
  const changed = changes.filter((change) => !isUnchanged(change))
  return changed.length === 0
    ? { content: true, status: false, assignees: false }
    : {
        content: changed.some((change) => change.content === true),
        status: changed.some((change) => change.status === true),
        assignees: changed.some((change) => change.assignees === true)
      }
}

export type SprintGroup = Readonly<{
  id: string
  kind: string
  completedAt: Date | null
  tickets: ReadonlyArray<string>
}>

export const openSprintIdsOf = (
  groups: ReadonlyArray<SprintGroup>,
  ticketId: string
): ReadonlyArray<string> =>
  groups.flatMap((group) =>
    group.kind === "sprint" &&
    group.completedAt === null &&
    group.tickets.includes(ticketId)
      ? [group.id]
      : []
  )

export const breaksEpicSprintRule = (
  existing: TicketDocument,
  next: TicketDocument,
  sprintsBefore: ReadonlyArray<string>,
  sprintsAfter: ReadonlyArray<string>
) =>
  next.type === "epic" &&
  sprintsAfter.length > 0 &&
  (existing.type !== "epic" ||
    sprintsAfter.some((id) => !sprintsBefore.includes(id)))

export const hierarchyChangeOf = (
  existing: TicketDocument,
  next: TicketDocument
): HierarchyChange => ({
  id: existing.id,
  fromType: existing.type,
  type: next.type,
  parent: next.parent,
  parentChanged: next.parent !== existing.parent
})
