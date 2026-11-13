import type { InboxResolution, StagedInbox } from "@pp/db/schema"
import {
  ActivityActor,
  InboxEvent,
  type ActivityCause,
  type InboxEventEncoded
} from "@pp/shared"
import * as Schema from "effect/Schema"

import { actorColumns } from "../activity/actorRow"
import type { TicketScopedChange } from "../activity/changes"
import {
  commentChanges,
  newlyMentioned,
  type SubscriptionSource
} from "../subscriptions/intents"

export type InboxNotice =
  | Readonly<{ kind: "assigned"; userId: string }>
  | Readonly<{ kind: "mentioned"; userId: string; commentId: string | null }>
  | Readonly<{ kind: "commented"; authorId: string; commentId: string }>

export type InboxInput = Readonly<{
  ticketId: string
  occurredAt: string
  actor: ActivityActor["Service"]
  cause: ActivityCause | null
  changes: ReadonlyArray<TicketScopedChange>
  notices: ReadonlyArray<InboxNotice>
  finished: ReadonlySet<string> | null
  statusBefore: string | null
}>

const CLEANUP_CAUSES: ReadonlySet<ActivityCause> = new Set([
  "status_removed",
  "tag_deleted",
  "member_removed",
  "sprint_completed",
  "group_deleted"
])

const encodeEvent = Schema.encodeSync(InboxEvent)

export const inboxNotices = (
  before: SubscriptionSource | null,
  after: SubscriptionSource
): ReadonlyArray<InboxNotice> => [
  ...(before === null
    ? after.assignees.map((userId) => ({ kind: "assigned" as const, userId }))
    : []),
  ...newlyMentioned(before?.body ?? "", after.body).map((userId) => ({
    kind: "mentioned" as const,
    userId,
    commentId: null
  })),
  ...commentChanges(before?.commentsRegion ?? "", after.commentsRegion)
    .filter((comment) => comment.native)
    .flatMap((comment) => [
      ...(comment.isNew && comment.authorId !== null
        ? [
            {
              kind: "commented" as const,
              authorId: comment.authorId,
              commentId: comment.commentId
            }
          ]
        : []),
      ...comment.mentioned.map((userId) => ({
        kind: "mentioned" as const,
        userId,
        commentId: comment.commentId
      }))
    ])
]

export const stageInbox = (input: InboxInput): StagedInbox | null => {
  const own = input.changes.filter((entry) => entry.ticketId === input.ticketId)
  const causes = [
    input.cause,
    ...own.map((entry) => entry.cause ?? input.cause)
  ].flatMap((cause) => (cause === null ? [] : [cause]))
  const actor = causes.includes("git_automation")
    ? ActivityActor.system("github")
    : input.actor
  const notify =
    !(actor.kind === "system" && actor.source === "import") &&
    !causes.some((cause) => CLEANUP_CAUSES.has(cause))

  const direct: Array<Readonly<{ userId: string; event: InboxEventEncoded }>> =
    []
  const subscribers: Array<InboxEventEncoded> = []
  const resolve: Array<InboxResolution> = []
  let unblocks = false

  for (const { change } of own) {
    switch (change.kind) {
      case "status_changed":
        subscribers.push(
          encodeEvent({
            kind: "status_changed",
            from: change.from,
            to: change.to
          })
        )
        if (input.finished?.has(change.to) === true) {
          resolve.push({ kind: "all" })
          if (!input.finished.has(change.from)) unblocks = true
        }
        break
      case "archived":
        subscribers.push(encodeEvent({ kind: "archived" }))
        resolve.push({ kind: "all" })
        if (
          input.statusBefore === null ||
          input.finished?.has(input.statusBefore) !== true
        )
          unblocks = true
        break
      case "assignees_changed":
        for (const userId of change.added)
          direct.push({ userId, event: encodeEvent({ kind: "assigned" }) })
        for (const userId of change.removed)
          resolve.push({ kind: "assigned", userId })
        subscribers.push(
          encodeEvent({
            kind: "reassigned",
            added: change.added,
            removed: change.removed
          })
        )
        break
      case "moved":
        subscribers.push(
          encodeEvent({
            kind: "moved",
            fromProject: change.fromProject,
            fromId: change.fromId
          })
        )
        break
      case "split":
        subscribers.push(encodeEvent({ kind: "split", into: change.into }))
        break
      default:
        break
    }
  }

  for (const notice of input.notices) {
    if (notice.kind === "commented") {
      subscribers.push(
        encodeEvent({ kind: "commented", commentId: notice.commentId })
      )
      resolve.push({ kind: "mentioned", userId: notice.authorId })
    } else if (notice.kind === "mentioned") {
      direct.push({
        userId: notice.userId,
        event: encodeEvent({ kind: "mentioned", commentId: notice.commentId })
      })
    } else {
      direct.push({
        userId: notice.userId,
        event: encodeEvent({ kind: "assigned" })
      })
    }
  }

  const readBy =
    actor.kind !== "system" && (own.length > 0 || input.notices.length > 0)
  if (
    !readBy &&
    direct.length === 0 &&
    subscribers.length === 0 &&
    resolve.length === 0
  )
    return null

  return {
    ticketId: input.ticketId,
    occurredAt: input.occurredAt,
    actor: actorColumns(actor),
    notify,
    readBy,
    direct,
    subscribers,
    resolve,
    unblockWith: unblocks ? [...(input.finished ?? [])] : null
  }
}
