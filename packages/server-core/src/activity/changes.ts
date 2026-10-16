import {
  UserId,
  type GroupDetail,
  type TicketActivityChange,
  type TicketId
} from "@pp/shared"
import * as Schema from "effect/Schema"

import type { TicketDocument } from "../tickets/TicketDocs"

const makeUserId = Schema.decodeUnknownSync(UserId)

export type TicketChangeSource = Pick<
  TicketDocument,
  | "title"
  | "status"
  | "priority"
  | "type"
  | "assignees"
  | "tags"
  | "body"
  | "archivedAt"
  | "branch"
  | "pr"
  | "prState"
>

const listDiff = <A>(
  before: ReadonlyArray<A>,
  after: ReadonlyArray<A>
): Readonly<{ added: ReadonlyArray<A>; removed: ReadonlyArray<A> }> | null => {
  const previous = new Set(before)
  const next = new Set(after)
  const added = after.filter((value) => !previous.has(value))
  const removed = before.filter((value) => !next.has(value))
  return added.length === 0 && removed.length === 0 ? null : { added, removed }
}

const prChange = (
  before: TicketChangeSource,
  after: TicketChangeSource
): TicketActivityChange | null => {
  if (after.pr === null) return null
  const samePr = before.pr === after.pr
  if (samePr && before.prState === after.prState) return null
  if (after.prState === "merged") return { kind: "pr_merged", number: after.pr }
  if (after.prState === "closed") return { kind: "pr_closed", number: after.pr }
  const reopened = before.prState === "closed" || before.prState === "merged"
  if (samePr && !reopened) return null
  return { kind: "pr_opened", number: after.pr }
}

export const ticketChanges = (
  before: TicketChangeSource,
  after: TicketChangeSource
): ReadonlyArray<TicketActivityChange> => {
  const changes: Array<TicketActivityChange> = []
  if (before.title !== after.title) {
    changes.push({ kind: "title_changed", from: before.title, to: after.title })
  }
  if (before.status !== after.status) {
    changes.push({
      kind: "status_changed",
      from: before.status,
      to: after.status
    })
  }
  if (before.priority !== after.priority) {
    changes.push({
      kind: "priority_changed",
      from: before.priority,
      to: after.priority
    })
  }
  if (before.type !== after.type) {
    changes.push({ kind: "type_changed", from: before.type, to: after.type })
  }
  const assignees = listDiff(before.assignees, after.assignees)
  if (assignees !== null) {
    changes.push({
      kind: "assignees_changed",
      added: assignees.added.map((id) => makeUserId(id)),
      removed: assignees.removed.map((id) => makeUserId(id))
    })
  }
  const tags = listDiff(before.tags, after.tags)
  if (tags !== null) {
    changes.push({
      kind: "tags_changed",
      added: tags.added,
      removed: tags.removed
    })
  }
  if (before.body !== after.body) changes.push({ kind: "description_edited" })
  if (before.archivedAt === null && after.archivedAt !== null) {
    changes.push({ kind: "archived" })
  }
  if (before.archivedAt !== null && after.archivedAt === null) {
    changes.push({ kind: "unarchived" })
  }
  if (before.branch !== after.branch) {
    if (before.branch !== null) {
      changes.push({ kind: "branch_unlinked", branch: before.branch })
    }
    if (after.branch !== null) {
      changes.push({ kind: "branch_linked", branch: after.branch })
    }
  }
  const pr = prChange(before, after)
  if (pr !== null) changes.push(pr)
  return changes
}

export type GroupMembershipSource = Pick<
  GroupDetail,
  "id" | "kind" | "name" | "tickets"
>

export type TicketScopedChange = Readonly<{
  ticketId: TicketId
  change: TicketActivityChange
}>

export const groupMembershipChanges = (
  before: GroupMembershipSource | null,
  after: GroupMembershipSource | null
): ReadonlyArray<TicketScopedChange> => {
  const group = after ?? before
  if (group === null) return []
  const diff = listDiff(before?.tickets ?? [], after?.tickets ?? [])
  if (diff === null) return []
  const subject = { groupId: group.id, groupKind: group.kind, name: group.name }
  return [
    ...diff.removed.map((ticketId) => ({
      ticketId,
      change: { kind: "group_removed" as const, ...subject }
    })),
    ...diff.added.map((ticketId) => ({
      ticketId,
      change: { kind: "group_added" as const, ...subject }
    }))
  ]
}
