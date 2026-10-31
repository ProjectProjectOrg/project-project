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

export const ticketChangeOf = (
  existing: TicketDocument,
  next: TicketDocument
): TicketPolicy.Change => {
  const status = next.status !== existing.status
  const assignees = listChanged(next.assignees, existing.assignees)
  const content =
    next.title !== existing.title ||
    next.type !== existing.type ||
    next.priority !== existing.priority ||
    next.parent !== existing.parent ||
    !Equal.equals(next.estimate, existing.estimate) ||
    next.body !== existing.body ||
    listChanged(next.tags, existing.tags)
  return { content: content || (!status && !assignees), status, assignees }
}

export const requestedChangeOf = (patch: TicketPatch): TicketPolicy.Change => {
  const status = patch.status !== undefined
  const assignees = patch.assignees !== undefined
  return {
    content:
      patch.type !== undefined ||
      patch.priority !== undefined ||
      patch.estimate !== undefined ||
      patch.tags !== undefined ||
      patch.parent !== undefined ||
      (!status && !assignees),
    status,
    assignees
  }
}

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
