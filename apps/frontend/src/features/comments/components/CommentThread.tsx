import type { Comment, TicketId } from "@pp/shared"
import { useLocation } from "@tanstack/react-router"
import { ChevronsDownUp, ChevronsUpDown } from "lucide-react"
import { useState } from "react"

import type { CommentViewRow } from "@/features/comments/atoms/comments"
import type { CommentThread as Thread } from "@/features/comments/lib/commentThreads"
import { foldedAuthors, threadFold } from "@/features/comments/lib/threadFold"
import { MemberAvatar } from "@/features/members/components/MemberAvatar"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

import { CommentRow } from "./CommentRow"
import { ReplyComposer } from "./ReplyComposer"

const foldClass =
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
  const resolved = root.comment.resolution !== null
  const { foldable, open } = threadFold({
    replies,
    resolved,
    manual: manual?.hash === hash ? manual.open : null,
    target: hash,
    editing
  })
  const shown = open ? replies : replies.slice(foldable.length)
  const FoldIcon = open ? ChevronsDownUp : ChevronsUpDown
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

  return (
    <div className="rounded-xl border border-border/60 bg-background transition-colors has-data-targeted:border-ring">
      <CommentRow
        comment={root.comment}
        thread={thread}
        pending={root.pending}
        ticketId={ticketId}
        onEditingChange={trackEditing(root.comment.id)}
      />
      {foldable.length > 0 && (
        <button
          type="button"
          aria-expanded={open}
          className={foldClass}
          onClick={() => setManual({ hash, open: !open })}
        >
          {open ? (
            m.comments_thread_collapse()
          ) : resolved ? (
            <FoldedComments comments={foldable.map((reply) => reply.comment)} />
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
            onEditingChange={trackEditing(reply.comment.id)}
          />
        </div>
      ))}
      {canReply && !root.pending && (
        <div hidden={resolved}>
          <ReplyComposer ticketId={ticketId} replyTo={root.comment.id} />
        </div>
      )}
    </div>
  )
}

function FoldedComments({
  comments
}: Readonly<{ comments: ReadonlyArray<Comment> }>) {
  const { people, names } = foldedAuthors(comments, getLocale())
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
