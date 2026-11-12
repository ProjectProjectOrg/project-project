import type { TicketPolicy } from "@pp/access/policies"
import {
  applyListEdit,
  type TicketFlag,
  type UpdateTicketInput
} from "@pp/shared"
import * as Equal from "effect/Equal"

import type * as TicketDocs from "./TicketDocs"
import type { HierarchyChange } from "./ticketHierarchy"

export type TicketPatch = UpdateTicketInput

const listChanged = (
  next: ReadonlyArray<string>,
  current: ReadonlyArray<string>
) =>
  next.length !== current.length ||
  next.some((value, index) => value !== current[index])

const uniqueOrUndefined = <A>(
  values: ReadonlyArray<A>
): ReadonlyArray<A> | undefined =>
  values.length === 0 ? undefined : [...new Set(values)]

const flagOf = (
  existing: TicketFlag | undefined,
  patch: TicketPatch["flag"],
  actor: string,
  now: Date
): TicketFlag | undefined => {
  if (patch === undefined) return existing
  if (patch === null) return undefined
  const reason = patch.reason?.trim() || undefined
  if (existing !== undefined && existing.reason === reason) return existing
  return reason === undefined
    ? { by: actor, at: now }
    : { reason, by: actor, at: now }
}

export const applyTicketPatch = (
  { flag: currentFlag, ...existing }: TicketDocs.TicketDocument,
  patch: TicketPatch,
  actor: string,
  now: Date
): TicketDocs.TicketDocument => {
  const flag = flagOf(currentFlag, patch.flag, actor, now)
  return {
    ...existing,
    title: patch.title ?? existing.title,
    status: patch.status ?? existing.status,
    type: patch.type ?? existing.type,
    parent:
      patch.parent === undefined
        ? existing.parent
        : (patch.parent ?? undefined),
    priority: patch.priority ?? existing.priority,
    estimate:
      patch.estimate === undefined
        ? existing.estimate
        : (patch.estimate ?? undefined),
    tags:
      patch.tags === undefined
        ? existing.tags
        : [...applyListEdit(existing.tags, patch.tags)],
    assignees:
      patch.assignees === undefined
        ? existing.assignees
        : [...applyListEdit(existing.assignees, patch.assignees)],
    blockedBy:
      patch.blockedBy === undefined
        ? existing.blockedBy
        : uniqueOrUndefined(patch.blockedBy),
    relatedTo:
      patch.relatedTo === undefined
        ? existing.relatedTo
        : uniqueOrUndefined(patch.relatedTo),
    ...(flag === undefined ? {} : { flag }),
    updatedBy: actor,
    updatedAt: now,
    body: patch.body ?? existing.body
  }
}

export const fieldChangesOf = (
  existing: TicketDocs.TicketDocument,
  next: TicketDocs.TicketDocument
): TicketPolicy.Change => ({
  content:
    next.title !== existing.title ||
    next.type !== existing.type ||
    next.priority !== existing.priority ||
    next.parent !== existing.parent ||
    !Equal.equals(next.estimate, existing.estimate) ||
    next.flag !== existing.flag ||
    next.body !== existing.body ||
    listChanged(next.tags, existing.tags) ||
    listChanged(next.blockedBy ?? [], existing.blockedBy ?? []) ||
    listChanged(next.relatedTo ?? [], existing.relatedTo ?? []),
  status: next.status !== existing.status,
  assignees: listChanged(next.assignees, existing.assignees)
})

export const isUnchanged = (change: TicketPolicy.Change) =>
  !change.content && !change.status && !change.assignees

export const ticketChangeOf = (
  existing: TicketDocs.TicketDocument,
  next: TicketDocs.TicketDocument
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
  existing: TicketDocs.TicketDocument,
  next: TicketDocs.TicketDocument,
  sprintsBefore: ReadonlyArray<string>,
  sprintsAfter: ReadonlyArray<string>
) =>
  next.type === "epic" &&
  sprintsAfter.length > 0 &&
  (existing.type !== "epic" ||
    sprintsAfter.some((id) => !sprintsBefore.includes(id)))

const patchableKeys = [
  "title",
  "status",
  "type",
  "priority",
  "parent",
  "estimate",
  "tags",
  "assignees",
  "body"
] as const

type PatchableKey = (typeof patchableKeys)[number]

const sameField = (
  key: PatchableKey,
  left: TicketDocs.TicketDocument,
  right: TicketDocs.TicketDocument
) => {
  const a = left[key]
  const b = right[key]
  return Array.isArray(a) && Array.isArray(b)
    ? !listChanged(a, b)
    : Equal.equals(a, b)
}

export const revertTicketPatch = (
  original: TicketDocs.TicketDocument,
  written: TicketDocs.TicketDocument,
  current: TicketDocs.TicketDocument
): TicketDocs.TicketDocument | null => {
  const hierarchyKeys: ReadonlyArray<PatchableKey> = ["type", "parent"]
  const hierarchyReverts = hierarchyKeys.every((key) =>
    sameField(key, current, written)
  )
  const reverted = new Set(
    patchableKeys.filter(
      (key) =>
        !sameField(key, written, original) &&
        sameField(key, current, written) &&
        (hierarchyReverts || !hierarchyKeys.includes(key))
    )
  )
  if (reverted.size === 0) return null
  const pick = <K extends PatchableKey>(key: K) =>
    reverted.has(key) ? original[key] : current[key]
  const restored: TicketDocs.TicketDocument = {
    ...current,
    title: pick("title"),
    status: pick("status"),
    type: pick("type"),
    priority: pick("priority"),
    parent: pick("parent"),
    estimate: pick("estimate"),
    tags: pick("tags"),
    assignees: pick("assignees"),
    body: pick("body")
  }
  if (current.updatedAt.getTime() !== written.updatedAt.getTime()) {
    return restored
  }
  return {
    ...restored,
    updatedAt: original.updatedAt,
    updatedBy: original.updatedBy
  }
}

export const hierarchyChangeOf = (
  existing: TicketDocs.TicketDocument,
  next: TicketDocs.TicketDocument
): HierarchyChange => ({
  id: existing.id,
  fromType: existing.type,
  type: next.type,
  parent: next.parent,
  parentChanged: next.parent !== existing.parent
})
