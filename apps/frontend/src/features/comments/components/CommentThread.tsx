import type { Comment, TicketId } from "@pp/shared"
import {
  CommentEarlier,
  CommentReplies,
  CommentReplyAction,
  CommentReplySwap,
  CommentThread as Thread
} from "@pp/ui/comment"
import { AvatarStack } from "@pp/ui/member-avatar"
import { useLocation } from "@tanstack/react-router"
import { useState } from "react"

import type { CommentViewRow } from "@/features/comments/atoms/comments"
import type { CommentThread as ThreadOf } from "@/features/comments/lib/commentThreads"
import { foldedAuthors, threadFold } from "@/features/comments/lib/threadFold"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

import { CommentRow } from "./CommentRow"
import { FailedCommentRow } from "./FailedCommentRow"
import { ReplyComposer } from "./ReplyComposer"

// A thread: the first comment, its replies one step in, the earlier replies
// folded into one row that opens right under itself, and Reply under the
// last bubble, which opens the reply box in its place.
export function CommentThread({
  thread: { root, replies },
  ticketId,
  canReply
}: Readonly<{
  thread: ThreadOf<CommentViewRow>
  ticketId: TicketId
  canReply: boolean
}>) {
  const hash = useLocation({ select: (location) => location.hash })
  const [manual, setManual] = useState<Readonly<{
    hash: string
    open: boolean
  }> | null>(null)
  const [editing, setEditing] = useState<ReadonlySet<string>>(new Set())
  const [replying, setReplying] = useState(false)
  const resolved = root.comment.resolution !== null
  const { foldable, open } = threadFold({
    replies,
    resolved,
    manual: manual?.hash === hash ? manual.open : null,
    target: hash,
    editing
  })
  const shown = replies.slice(foldable.length)
  const thread = {
    root: root.comment,
    replies: replies.map((reply) => reply.comment)
  }
  const trackEditing = (id: string) => (active: boolean) =>
    setEditing((current) => {
      const next = new Set(current)
      if (active) next.add(id)
      else next.delete(id)
      return next
    })
  const row = (entry: CommentViewRow) =>
    entry.failed !== null ? (
      <FailedCommentRow
        key={entry.key}
        entry={entry.failed}
        ticketId={ticketId}
      />
    ) : (
      <CommentRow
        key={entry.key}
        comment={entry.comment}
        thread={thread}
        pending={entry.pending}
        ticketId={ticketId}
        onEditingChange={trackEditing(entry.comment.id)}
      />
    )
  const mayReply =
    canReply && !root.pending && root.failed === null && !resolved

  return (
    <Thread>
      {row(root)}
      {(replies.length > 0 || mayReply) && (
        <CommentReplies>
          {foldable.length > 0 && (
            <CommentEarlier
              label={
                open ? (
                  m.comments_thread_collapse()
                ) : resolved ? (
                  <FoldedComments
                    comments={foldable.map((entry) => entry.comment)}
                  />
                ) : (
                  m.comments_thread_show_earlier({ count: foldable.length })
                )
              }
              open={open}
              onOpenChange={(next) => setManual({ hash, open: next })}
            >
              {foldable.map(row)}
            </CommentEarlier>
          )}
          {shown.map(row)}
          {mayReply && (
            <CommentReplySwap
              open={replying}
              under={replies.length === 0 ? "comment" : "reply"}
              action={
                <CommentReplyAction
                  under={replies.length === 0 ? "comment" : "reply"}
                  onClick={() => setReplying(true)}
                >
                  {m.comments_reply_submit()}
                </CommentReplyAction>
              }
            >
              <ReplyComposer
                ticketId={ticketId}
                replyTo={root.comment.id}
                onClose={() => setReplying(false)}
              />
            </CommentReplySwap>
          )}
        </CommentReplies>
      )}
    </Thread>
  )
}

function FoldedComments({
  comments
}: Readonly<{ comments: ReadonlyArray<Comment> }>) {
  const { people, names } = foldedAuthors(comments, getLocale())
  return (
    <>
      <AvatarStack subjects={people} size={16} max={3} />
      {m.comments_thread_resolved_folded({ count: comments.length, names })}
    </>
  )
}
