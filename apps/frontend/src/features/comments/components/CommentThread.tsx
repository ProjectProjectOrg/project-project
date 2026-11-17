import type { TicketId } from "@pp/shared"
import { useLocation } from "@tanstack/react-router"
import { useState } from "react"

import type { CommentViewRow } from "@/features/comments/atoms/comments"
import type { CommentThread as Thread } from "@/features/comments/lib/commentThreads"
import { m } from "@/paraglide/messages"

import { CommentRow } from "./CommentRow"
import { ReplyComposer } from "./ReplyComposer"

const FOLD_AFTER = 3
const KEEP_OPEN = 2

const showEarlierClass =
  "flex w-full items-center gap-2 border-t border-border/60 px-4 py-2 text-left text-body text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"

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
  const folded =
    !expanded &&
    replies.length > FOLD_AFTER &&
    !replies.slice(0, -KEEP_OPEN).some((reply) => reply.comment.id === hash)
  const shown = folded ? replies.slice(-KEEP_OPEN) : replies

  return (
    <div className="rounded-xl border border-border/60 bg-background transition-colors has-data-targeted:border-ring">
      <CommentRow
        comment={root.comment}
        replies={replies.map((reply) => reply.comment)}
        pending={root.pending}
        reply={false}
        ticketId={ticketId}
      />
      {folded && (
        <button
          type="button"
          className={showEarlierClass}
          onClick={() => setExpanded(true)}
        >
          {m.comments_thread_show_earlier({
            count: replies.length - shown.length
          })}
        </button>
      )}
      {shown.map((reply) => (
        <div key={reply.key} className="border-t border-border/60">
          <CommentRow
            comment={reply.comment}
            replies={[]}
            pending={reply.pending}
            reply
            ticketId={ticketId}
          />
        </div>
      ))}
      {canReply && !root.pending && (
        <ReplyComposer ticketId={ticketId} replyTo={root.comment.id} />
      )}
    </div>
  )
}
