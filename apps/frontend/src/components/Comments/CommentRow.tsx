import { useAtomValue, useAtomSet } from "@effect/atom-react"
import type { Comment, TicketId } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { useState } from "react"

import { ConfirmDeleteIcon } from "@/components/ConfirmDeleteIcon"
import { LexicalEditor } from "@/components/LexicalEditor"
import { Markdown } from "@/components/Markdown"
import { MemberAvatar } from "@/components/MemberAvatar"
import { Button } from "@/components/ui/button"
import { InlineForm, useInlineForm } from "@/components/ui/inline-form"
import { me } from "@/features/auth/atoms/auth"
import {
  commentsRequest,
  deleteComment,
  editComment
} from "@/features/comments/atoms/comments"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

type Mode = "idle" | "edit"

export function CommentRow({
  comment,
  pending = false,
  orgSlug,
  slug,
  ticketId
}: {
  comment: Comment
  pending?: boolean
  orgSlug: string
  slug: string
  ticketId: TicketId
}) {
  const viewer = useAtomValue(me())
  const linkedAuthor =
    comment.author.kind === "user" ? comment.author.user : null
  const authorName =
    comment.author.kind === "user"
      ? (comment.author.user.name ?? comment.author.user.email)
      : comment.author.displayName
  const isAuthor =
    !pending &&
    comment.origin === "native" &&
    linkedAuthor !== null &&
    Result.isSuccess(viewer) &&
    viewer.value.id === linkedAuthor.id
  const req = commentsRequest(orgSlug, slug, ticketId)
  const key = { req, commentId: comment.id }
  const editState = useAtomValue(editComment(key))
  const deleteState = useAtomValue(deleteComment(key))
  const waiting = pending || editState.waiting || deleteState.waiting
  const remove = useAtomSet(deleteComment(key), { mode: "promise" })

  return (
    <InlineForm.Root<Mode>
      className={cn("rounded-md p-3", waiting && "animate-pulse")}
    >
      <InlineForm.Idle block>
        <header className="flex items-center justify-between gap-2 text-sm">
          <div className="flex items-center gap-2">
            {linkedAuthor && <MemberAvatar member={linkedAuthor} size={20} />}
            <span className="font-medium">{authorName}</span>
            <time className="text-muted-foreground">
              {DateTime.toDate(
                DateTime.makeUnsafe(comment.createdAt)
              ).toLocaleString(getLocale())}
            </time>
            {comment.editedAt && (
              <span className="text-xs text-muted-foreground">
                {m.comments_edited_marker()}
              </span>
            )}
            {comment.origin === "jira" && (
              <span className="text-xs text-muted-foreground">
                {m.comments_imported_from_jira()}
              </span>
            )}
          </div>
          {isAuthor && (
            <div className="flex items-center gap-1">
              <InlineForm.Trigger<Mode> action="edit" size="sm" variant="ghost">
                {m.comments_edit_button()}
              </InlineForm.Trigger>
              <ConfirmDeleteIcon
                ariaLabel={m.comments_delete_aria_label()}
                message={m.comments_delete_confirm()}
                onConfirm={async () => {
                  await remove()
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
    editComment({
      req: commentsRequest(orgSlug, slug, ticketId),
      commentId: comment.id
    }),
    { mode: "promise" }
  )
  const { close, busy, setBusy } = useInlineForm()

  const save = async () => {
    if (!body.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      await edit({ body })
      close()
    } catch (e) {
      setError(e instanceof Error ? e.message : m.comments_save_failed())
      setBusy(false)
    }
  }

  return (
    <>
      <header className="mt-1.5 flex items-center gap-2 text-sm">
        {comment.author.kind === "user" && (
          <MemberAvatar member={comment.author.user} size={20} />
        )}
        <span className="font-medium">
          {comment.author.kind === "user"
            ? (comment.author.user.name ?? comment.author.user.email)
            : comment.author.displayName}
        </span>
        <span className="text-muted-foreground">
          {m.comments_editing_marker()}
        </span>
      </header>
      <LexicalEditor markdown={body} onChange={(md) => setBody(md)} autoFocus />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <InlineForm.Cancel />
        <Button size="sm" onClick={save} disabled={busy || !body.trim()}>
          {m.comments_save_button()}
        </Button>
      </div>
    </>
  )
}
