import type { Comment, TicketId } from "@pp/shared"
import { useLocation } from "@tanstack/react-router"
import { ChevronsDownUp, ChevronsUpDown } from "lucide-react"
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
  const [expanded, setExpanded] = useState<boolean | null>(null)
  const hash = useLocation({ select: (location) => location.hash })
  const resolved = root.comment.resolution !== null
  const foldable = hiddenReplies(replies, resolved)
  const open = expanded ?? foldable.some((reply) => reply.comment.id === hash)
  const hidden = open ? [] : foldable
  const shown = replies.slice(hidden.length)
  const FoldIcon = open ? ChevronsDownUp : ChevronsUpDown
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
      {foldable.length > 0 && (
        <button
          type="button"
          aria-expanded={open}
          className={foldClass}
          onClick={() => setExpanded(!open)}
        >
          {resolved ? (
            <FoldedComments comments={foldable.map((reply) => reply.comment)} />
          ) : open ? (
            m.comments_thread_hide_earlier({ count: foldable.length })
          ) : (
            m.comments_thread_show_earlier({ count: foldable.length })
          )}
          <FoldIcon className="ml-auto size-4" strokeWidth={1.75} aria-hidden />
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
