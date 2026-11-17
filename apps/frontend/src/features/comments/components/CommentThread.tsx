import type { TicketId } from "@pp/shared"
import { useLocation } from "@tanstack/react-router"
import { useState } from "react"

import type { CommentViewRow } from "@/features/comments/atoms/comments"
import type { CommentThread as Thread } from "@/features/comments/lib/commentThreads"
import { threadFold } from "@/features/comments/lib/threadFold"
import { m } from "@/paraglide/messages"

import { CommentRow } from "./CommentRow"
import { ReplyComposer } from "./ReplyComposer"

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
  const hash = useLocation({ select: (location) => location.hash })
  const [manual, setManual] = useState<Readonly<{
    hash: string
    open: boolean
  }> | null>(null)
  const [editing, setEditing] = useState<ReadonlySet<string>>(new Set())
  const { foldable, open } = threadFold({
    replies,
    manual: manual?.hash === hash ? manual.open : null,
    target: hash,
    editing
  })
  const folded = !open && foldable.length > 0
  const shown = folded ? replies.slice(foldable.length) : replies
  const trackEditing = (id: string) => (active: boolean) =>
    setEditing((current) => {
      const next = new Set(current)
      if (active) next.add(id)
      else next.delete(id)
      return next
    })

  return (
    <div className="rounded-xl border border-border/60 bg-background transition-colors has-data-targeted:border-ring">
      <CommentRow
        comment={root.comment}
        replies={replies.map((reply) => reply.comment)}
        pending={root.pending}
        reply={false}
        ticketId={ticketId}
        onEditingChange={trackEditing(root.comment.id)}
      />
      {folded && (
        <button
          type="button"
          className={showEarlierClass}
          onClick={() => setManual({ hash, open: true })}
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
            onEditingChange={trackEditing(reply.comment.id)}
          />
        </div>
      ))}
      {canReply && !root.pending && (
        <ReplyComposer ticketId={ticketId} replyTo={root.comment.id} />
      )}
    </div>
  )
}
