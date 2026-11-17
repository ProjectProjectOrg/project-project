import type { Comment, TicketId } from "@pp/shared"
import { useLocation } from "@tanstack/react-router"
import { useState } from "react"

import type { CommentViewRow } from "@/features/comments/atoms/comments"
import { commentAuthorName } from "@/features/comments/lib/commentClipboard"
import type { CommentThread as Thread } from "@/features/comments/lib/commentThreads"
import { MemberAvatar } from "@/features/members/components/MemberAvatar"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

import { CommentRow } from "./CommentRow"
import { ReplyComposer } from "./ReplyComposer"

const FOLD_AFTER = 3
const KEEP_OPEN = 2

const foldClass =
  "flex w-full items-center gap-2 border-t border-border/60 px-4 py-2 text-left text-body text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"

const hiddenReplies = (
  replies: ReadonlyArray<CommentViewRow>,
  resolved: boolean
) =>
  resolved
    ? replies.slice(0, -1)
    : replies.length > FOLD_AFTER
      ? replies.slice(0, -KEEP_OPEN)
      : []

export function CommentThread({
  thread: { root, replies },
  ticketId,
  canReply
}: Readonly<{
  thread: Thread<CommentViewRow>
  ticketId: TicketId
  canReply: boolean
}>) {
  const [expanded, setExpanded] = useState(false)
  const hash = useLocation({ select: (location) => location.hash })
  const resolved = root.comment.resolution !== null
  const candidates = hiddenReplies(replies, resolved)
  const hidden =
    expanded || candidates.some((reply) => reply.comment.id === hash)
      ? []
      : candidates
  const shown = replies.slice(hidden.length)
  const thread = {
    root: root.comment,
    replies: replies.map((reply) => reply.comment)
  }

  return (
    <div className="rounded-xl border border-border/60 bg-background transition-colors has-data-targeted:border-ring">
      <CommentRow
        comment={root.comment}
        thread={thread}
        pending={root.pending}
        ticketId={ticketId}
      />
      {hidden.length > 0 && (
        <button
          type="button"
          className={foldClass}
          onClick={() => setExpanded(true)}
        >
          {resolved ? (
            <FoldedComments comments={hidden.map((reply) => reply.comment)} />
          ) : (
            m.comments_thread_show_earlier({ count: hidden.length })
          )}
        </button>
      )}
      {shown.map((reply) => (
        <div key={reply.key} className="border-t border-border/60">
          <CommentRow
            comment={reply.comment}
            thread={thread}
            pending={reply.pending}
            ticketId={ticketId}
          />
        </div>
      ))}
      {canReply && !resolved && !root.pending && (
        <ReplyComposer ticketId={ticketId} replyTo={root.comment.id} />
      )}
    </div>
  )
}

function FoldedComments({
  comments
}: Readonly<{ comments: ReadonlyArray<Comment> }>) {
  const people = [
    ...new Map(
      comments.flatMap((comment) =>
        comment.author.kind === "user"
          ? [[comment.author.user.id, comment.author.user] as const]
          : []
      )
    ).values()
  ]
  const names = new Intl.ListFormat(getLocale(), {
    type: "conjunction"
  }).format([
    ...new Set(comments.map((comment) => commentAuthorName(comment.author)))
  ])
  return (
    <>
      <span className="flex -space-x-1.5">
        {people.slice(0, 3).map((person) => (
          <MemberAvatar
            key={person.id}
            member={person}
            size={20}
            className="ring-2 ring-background"
          />
        ))}
      </span>
      {m.comments_thread_resolved_folded({ count: comments.length, names })}
    </>
  )
}
