import { useState } from "react"
import { useAtomValue, useAtomSet, Result } from "@effect-atom/atom-react"
import { Markdown } from "@/components/Markdown"
import { MemberAvatar } from "@/components/MemberAvatar"
import { Button } from "@/components/ui/button"
import { ConfirmDeleteIcon } from "@/components/ConfirmDeleteIcon"
import { InlineForm, useInlineForm } from "@/components/ui/inline-form"
import { LexicalEditor } from "@/components/LexicalEditor"
import { meAtom } from "@/atoms/auth"
import {
  commentsKey,
  deleteCommentAtom,
  editCommentAtom
} from "@/atoms/comments"
import type { Comment, TicketId } from "@projectproject/shared"
import { cn } from "@/lib/utils"

type Mode = "idle" | "edit"

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
  const me = useAtomValue(meAtom)
  const isAuthor = Result.isSuccess(me) && me.value.id === comment.author.id
  const key = commentsKey(orgSlug, slug, ticketId)
  const deleteComment = useAtomSet(deleteCommentAtom(key), { mode: "promise" })

  return (
    <InlineForm.Root<Mode>
      className={cn("p-3 rounded-md", waiting && "animate-pulse")}
    >
      <InlineForm.Idle block>
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
              <InlineForm.Trigger<Mode> action="edit" size="sm" variant="ghost">
                Edit
              </InlineForm.Trigger>
              <ConfirmDeleteIcon
                ariaLabel="Delete comment"
                message="Delete this comment?"
                onConfirm={async () => {
                  await deleteComment({ commentId: comment.id })
                }}
              />
            </div>
          )}
        </header>
        <div className="mt-2">
          <Markdown>{comment.body}</Markdown>
        </div>
      </InlineForm.Idle>
      <InlineForm.Form<Mode> action="edit">
        <EditForm
          comment={comment}
          orgSlug={orgSlug}
          slug={slug}
          ticketId={ticketId}
        />
      </InlineForm.Form>
    </InlineForm.Root>
  )
}

function EditForm({
  comment,
  orgSlug,
  slug,
  ticketId
}: {
  comment: Comment
  orgSlug: string
  slug: string
  ticketId: TicketId
}) {
  const [body, setBody] = useState(comment.body)
  const [error, setError] = useState<string | null>(null)
  const edit = useAtomSet(
    editCommentAtom(commentsKey(orgSlug, slug, ticketId)),
    { mode: "promise" }
  )
  const { close, busy, setBusy } = useInlineForm()

  const save = async () => {
    if (!body.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      await edit({ commentId: comment.id, body })
      close()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.")
      setBusy(false)
    }
  }

  return (
    <>
      <header className="flex items-center gap-2 text-sm">
        <MemberAvatar member={comment.author} size={20} />
        <span className="font-medium">
          {comment.author.name ?? comment.author.email}
        </span>
        <span className="text-muted-foreground">editing…</span>
      </header>
      <LexicalEditor
        markdown={body}
        onChange={(md) => setBody(md)}
        autoFocus
      />
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="flex justify-end gap-2">
        <InlineForm.Cancel />
        <Button size="sm" onClick={save} disabled={busy || !body.trim()}>
          Save
        </Button>
      </div>
    </>
  )
}

