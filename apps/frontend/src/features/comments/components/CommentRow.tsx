import { useAtomValue, useAtomSet } from "@effect/atom-react"
import { CommentPolicy } from "@pp/access/policies"
import type { Comment, TicketId } from "@pp/shared"
import { Button } from "@pp/ui/button"
import { ConfirmButton } from "@pp/ui/confirm-button"
import { LexicalEditor } from "@pp/ui/editor/lexical-editor"
import { Markdown } from "@pp/ui/editor/markdown"
import { InlineForm, useInlineForm } from "@pp/ui/inline-form"
import { cn } from "@pp/ui/lib/utils"
import { MemberAvatar } from "@pp/ui/member-avatar"
import * as Exit from "effect/Exit"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { useState } from "react"

import {
  commentsRequest,
  deleteComment,
  editComment
} from "@/features/comments/atoms/comments"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { TimelineTime } from "@/features/tickets/components/TimelineTime"
import { useProjectActor } from "@/hooks/useActor"
import { errorMessage, describeCause } from "@/lib/errorMessage"
import { mutationErrorText } from "@/lib/mutationError"
import { m } from "@/paraglide/messages"

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
  const deleteError = mutationErrorText(
    deleteState,
    () => m.comments_delete_failed(),
    m.comments_delete_failed
  )

  return (
    <InlineForm.Root<Mode>
      actions={["edit"]}
      fade={false}
      className={cn(
        "ticket-comment rounded-xl border-border/60 p-0 [--fs-body:13px] [--lh-body:20px] [--text-body--line-height:20px] [--text-body:13px] corner-squircle",
        waiting && "animate-pulse"
      )}
    >
      <InlineForm.Idle block>
        <CommentHeader comment={comment}>
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
                      cancelLabel={m.common_cancel_button()}
                      describeError={describeCause}
                      prompt={m.comments_delete_confirm()}
                      label={m.common_delete_confirm_button()}
                      busyLabel={m.common_deleting_button()}
                      onConfirm={() => remove()}
                    />
                  </ConfirmButton.Confirm>
                </ConfirmButton.Root>
              )}
            </div>
          )}
        </CommentHeader>
        <div className="px-3 pt-1 pb-3">
          <Markdown>{comment.body}</Markdown>
        </div>
        {deleteError && (
          <p role="alert" className="px-3 pb-3 text-body text-destructive">
            {deleteError}
          </p>
        )}
      </InlineForm.Idle>
      <InlineForm.Form action="edit">
        <EditForm comment={comment} ticketId={ticketId} />
      </InlineForm.Form>
    </InlineForm.Root>
  )
}

function CommentHeader({
  comment,
  children
}: {
  comment: Comment
  children: React.ReactNode
}) {
  const author = comment.author
  return (
    <header className="flex min-h-7 items-center justify-between gap-2 pt-2 pr-1.5 pl-3 text-body">
      {/* min-h-7 matches the action buttons, so the avatar sits 12px from
          the top and left edges whether or not the buttons show. */}
      <div className="flex min-h-7 items-center gap-2">
        {author.kind === "user" && (
          <MemberAvatar member={author.user} size={20} />
        )}
        <span className="font-semibold">
          {author.kind === "user"
            ? (author.user.name ?? author.user.email)
            : author.displayName}
        </span>
        <TimelineTime at={comment.createdAt} />
        {comment.editedAt && (
          <span className="text-caption text-muted-foreground">
            {m.comments_edited_marker()}
          </span>
        )}
        {comment.origin === "jira" && (
          <span className="text-caption text-muted-foreground">
            {m.comments_imported_from_jira()}
          </span>
        )}
      </div>
      {children}
    </header>
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
      <CommentHeader comment={comment}>
        <span className="text-body text-muted-foreground">
          {m.comments_editing_marker()}
        </span>
      </CommentHeader>
      <div className="px-3 pt-1">
        <LexicalEditor
          markdown={body}
          onDraftChange={setBody}
          autoFocus
          compact
        />
      </div>
      {error && <p className="px-3 text-body text-destructive">{error}</p>}
      <div className="flex justify-end gap-2 p-1.5">
        <InlineForm.Cancel>{m.common_cancel_button()}</InlineForm.Cancel>
        <Button size="sm" onClick={save} disabled={busy || !body.trim()}>
          {m.comments_save_button()}
        </Button>
      </div>
    </>
  )
}
