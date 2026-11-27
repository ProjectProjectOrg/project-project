import type {
  InboxResolution,
  StagedInbox,
  StagedInboxDelivery
} from "@pp/db/schema"
import {
  ActivityActor,
  InboxEvent,
  type ActivityCause,
  type InboxEventEncoded
} from "@pp/shared"
import * as Data from "effect/Data"
import * as Schema from "effect/Schema"

import { actorColumns } from "../activity/actorRow"
import type { TicketScopedChange } from "../activity/changes"
import {
  commentChanges,
  newlyMentioned,
  type SubscriptionSource
} from "../subscriptions/intents"
import { assignedKey, mentionKey } from "./entries"

export type InboxNotice = Data.TaggedEnum<{
  assigned: Readonly<{ userId: string }>
  mentioned: Readonly<{
    userId: string
    commentId: string | null
    threadId: string | null
  }>
  commented: Readonly<{ authorId: string; commentId: string; threadId: string }>
}>
export const InboxNotice = Data.taggedEnum<InboxNotice>()

export type InboxInput = Readonly<{
  ticketId: string
  occurredAt: string
  actor: ActivityActor["Service"]
  cause: ActivityCause | null
  changes: ReadonlyArray<TicketScopedChange>
  notices: ReadonlyArray<InboxNotice>
  finished: ReadonlySet<string> | null
  statusBefore: string | null
  touched: boolean
}>

const CLEANUP_CAUSES: ReadonlySet<ActivityCause> = new Set([
  "status_removed",
  "tag_deleted",
  "member_removed",
  "sprint_completed",
  "group_deleted"
])

const encodeEvent = Schema.encodeSync(InboxEvent)

const assignedDelivery = (userId: string) =>
  ({
    userId,
    key: assignedKey,
    event: encodeEvent({ kind: "assigned" }),
    commentId: null
  }) satisfies StagedInboxDelivery

export const inboxNotices = (
  before: SubscriptionSource | null,
  after: SubscriptionSource
) => [
  ...(before === null
    ? after.assignees.map((userId) => InboxNotice.assigned({ userId }))
    : []),
  ...newlyMentioned(before?.body ?? "", after.body).map((userId) =>
    InboxNotice.mentioned({ userId, commentId: null, threadId: null })
  ),
  ...commentChanges(before?.commentsRegion ?? "", after.commentsRegion)
    .filter((comment) => comment.native)
    .flatMap((comment) => [
      ...(comment.isNew && comment.authorId !== null
        ? [
            InboxNotice.commented({
              authorId: comment.authorId,
              commentId: comment.commentId,
              threadId: comment.threadId
            })
          ]
        : []),
      ...comment.mentioned.map((userId) =>
        InboxNotice.mentioned({
          userId,
          commentId: comment.commentId,
          threadId: comment.threadId
        })
      )
    ])
]

export const stageInbox = (input: InboxInput) => {
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

  const direct: Array<StagedInboxDelivery> = []
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
          resolve.push({ kind: "finished" })
          if (!input.finished.has(change.from)) unblocks = true
        }
        break
      case "archived":
        subscribers.push(encodeEvent({ kind: "archived" }))
        resolve.push({ kind: "finished" })
        if (
          input.statusBefore === null ||
          input.finished?.has(input.statusBefore) !== true
        )
          unblocks = true
        break
      case "assignees_changed":
        for (const userId of change.added) direct.push(assignedDelivery(userId))
        for (const userId of change.removed)
          resolve.push({ kind: "unassigned", userId })
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
    InboxNotice.$match(notice, {
      commented: ({ authorId, commentId, threadId }) => {
        subscribers.push(encodeEvent({ kind: "commented", commentId }))
        resolve.push({ kind: "replied", userId: authorId, threadId })
      },
      mentioned: ({ userId, commentId, threadId }) => {
        direct.push({
          userId,
          key: mentionKey(threadId),
          event: encodeEvent({ kind: "mentioned", commentId }),
          commentId
        })
      },
      assigned: ({ userId }) => {
        direct.push(assignedDelivery(userId))
      }
    })
  }

  const delivered = resolve.some((resolution) => resolution.kind === "finished")
    ? []
    : direct

  const readBy =
    actor.kind !== "system" &&
    (own.length > 0 || input.notices.length > 0 || input.touched)
  if (
    !readBy &&
    delivered.length === 0 &&
    subscribers.length === 0 &&
    resolve.length === 0
  )
    return null

  return {
    version: 2,
    ticketId: input.ticketId,
    occurredAt: input.occurredAt,
    actor: actorColumns(actor),
    notify,
    readBy,
    direct: delivered,
    subscribers,
    resolve,
    unblockWith: unblocks ? [...(input.finished ?? [])] : null
  } satisfies StagedInbox
}
