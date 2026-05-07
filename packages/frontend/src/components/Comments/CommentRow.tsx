import { useState } from "react"
import { useAtomValue, useAtomSet, Result } from "@effect-atom/atom-react"
import { Markdown } from "@/components/Markdown"
import { MemberAvatar } from "@/components/MemberAvatar"
import { Button } from "@/components/ui/button"
import { meAtom } from "@/atoms/auth"
import { commentsKey, deleteCommentAtom } from "@/atoms/comments"
import type { Comment, TicketId } from "@projectproject/shared"
import { CommentEditor } from "./CommentEditor"
import { cn } from "@/lib/utils"

export function CommentRow({
  comment,
  waiting,
  orgSlug,
  slug,
  ticketId
}: {
  comment: Comment
  waiting: boolean
  orgSlug: string
  slug: string
  ticketId: TicketId
}) {
  const [editing, setEditing] = useState(false)
  const me = useAtomValue(meAtom)
  const isAuthor = Result.isSuccess(me) && me.value.id === comment.author.id
  const key = commentsKey(orgSlug, slug, ticketId)
  const deleteComment = useAtomSet(deleteCommentAtom(key), { mode: "promise" })

  if (editing) {
    return (
      <CommentEditor
        comment={comment}
        orgSlug={orgSlug}
        slug={slug}
        ticketId={ticketId}
        onDone={() => setEditing(false)}
      />
    )
  }

  return (
    <article
      className={cn(
        "border-border rounded-md border p-3",
        waiting && "animate-pulse"
      )}
    >
      <header className="flex items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-2">
          <MemberAvatar member={comment.author} size={20} />
          <span className="font-medium">
            {comment.author.name ?? comment.author.email}
          </span>
          <time className="text-muted-foreground">
            {new Date(comment.createdAt).toLocaleString()}
          </time>
          {comment.editedAt && (
            <span className="text-muted-foreground text-xs">(edited)</span>
          )}
        </div>
        {isAuthor && (
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(true)}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => deleteComment({ commentId: comment.id })}
            >
              Delete
            </Button>
          </div>
        )}
      </header>
      <div className="mt-2">
        <Markdown>{comment.body}</Markdown>
      </div>
    </article>
  )
}
