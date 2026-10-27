import { useAtomValue, useAtomSet } from "@effect/atom-react"
import { CommentPolicy } from "@pp/access/policies"
import type { Comment, TicketId } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Exit from "effect/Exit"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { ConfirmButton } from "@/components/ui/confirm-button"
import { InlineForm, useInlineForm } from "@/components/ui/inline-form"
import {
  commentsRequest,
  deleteComment,
  editComment
} from "@/features/comments/atoms/comments"
import { LexicalEditor } from "@/features/editor/components/LexicalEditor"
import { Markdown } from "@/features/editor/components/Markdown"
import { MemberAvatar } from "@/features/members/components/MemberAvatar"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { useProjectActor } from "@/lib/access"
import { errorMessage } from "@/lib/errorMessage"
import { mutationErrorText } from "@/lib/mutationError"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

type Mode = "idle" | "edit"

export function CommentRow({
  comment,
  pending = false,

  ticketId
}: {
  comment: Comment
  pending?: boolean
  ticketId: TicketId
}) {
  const { orgSlug, slug } = useProjectRoute()
  const actor = useProjectActor()
  const linkedAuthor =
    comment.author.kind === "user" ? comment.author.user : null
  const authorName =
    comment.author.kind === "user"
      ? (comment.author.user.name ?? comment.author.user.email)
      : comment.author.displayName
  const authored =
    !pending && comment.origin === "native" && linkedAuthor !== null
      ? { authorId: linkedAuthor.id }
      : null
  const canEdit = authored !== null && CommentPolicy.canEdit(actor, authored)
  const canDelete =
    authored !== null && CommentPolicy.canDelete(actor, authored)
  const req = commentsRequest(orgSlug, slug, ticketId)
  const key = { req, commentId: comment.id }
  const editState = useAtomValue(editComment(key))
  const deleteState = useAtomValue(deleteComment(key))
  const waiting = pending || editState.waiting || deleteState.waiting
  const remove = useAtomSet(deleteComment(key), { mode: "promiseExit" })

  return (
    <InlineForm.Root<Mode>
      actions={["edit"]}
      className={cn(
        "ticket-comment rounded-md p-(--ticket-comment-pad)",
        waiting && "animate-pulse"
      )}
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
          {(canEdit || canDelete) && (
            <div className="flex items-center gap-1">
              {canEdit && (
                <InlineForm.Trigger<Mode>
                  action="edit"
                  size="sm"
                  variant="ghost"
                >
                  {m.comments_edit_button()}
                </InlineForm.Trigger>
              )}
              {canDelete && (
                <ConfirmButton.Root>
                  <ConfirmButton.DeleteTrigger
                    aria-label={m.comments_delete_aria_label()}
                  />
                  <ConfirmButton.Confirm>
                    <ConfirmButton.Action
                      prompt={m.comments_delete_confirm()}
                      label={m.common_delete_confirm_button()}
                      busyLabel={m.common_deleting_button()}
                      onConfirm={async () => Exit.isSuccess(await remove())}
                    />
                  </ConfirmButton.Confirm>
                </ConfirmButton.Root>
              )}
            </div>
          )}
        </header>
        <div className="mt-2">
          <Markdown>{comment.body}</Markdown>
        </div>
      </InlineForm.Idle>
      <InlineForm.Form action="edit">
        <EditForm comment={comment} ticketId={ticketId} />
      </InlineForm.Form>
    </InlineForm.Root>
  )
}

function EditForm({
  comment,

  ticketId
}: {
  comment: Comment
  ticketId: TicketId
}) {
  const { orgSlug, slug } = useProjectRoute()
  const [body, setBody] = useState(comment.body)
  const [error, setError] = useState<string | null>(null)
  const edit = useAtomSet(
    editComment({
      req: commentsRequest(orgSlug, slug, ticketId),
      commentId: comment.id
    }),
    { mode: "promiseExit" }
  )
  const { close, busy, setBusy } = useInlineForm()

  const save = async () => {
    if (!body.trim() || busy) return
    setBusy(true)
    setError(null)
    const exit = await edit({ body })
    if (Exit.isSuccess(exit)) return close()
    setError(
      mutationErrorText(
        AsyncResult.fromExit(exit),
        errorMessage,
        m.comments_save_failed
      )
    )
    setBusy(false)
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
