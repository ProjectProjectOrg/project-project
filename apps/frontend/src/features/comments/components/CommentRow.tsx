import { useAtomValue, useAtomSet } from "@effect/atom-react"
import { CommentPolicy } from "@pp/access/policies"
import type { Comment, TicketId } from "@pp/shared"
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
import { TimelineTime } from "@/features/tickets/components/TimelineTime"
import { useProjectActor } from "@/hooks/useActor"
import { errorMessage } from "@/lib/errorMessage"
import { mutationErrorText } from "@/lib/mutationError"
import { cn } from "@/lib/utils"
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

  return (
    <InlineForm.Root<Mode>
      actions={["edit"]}
      fade={false}
      className={cn(
        "ticket-comment rounded-md p-(--ticket-comment-pad)",
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
        </CommentHeader>
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

function CommentHeader({
  comment,
  children
}: {
  comment: Comment
  children: React.ReactNode
}) {
  const author = comment.author
  return (
    <header className="flex min-h-8 items-center justify-between gap-2 text-body">
      <div className="flex items-center gap-2">
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
      <LexicalEditor
        markdown={body}
        onDraftChange={setBody}
        autoFocus
        compact
      />
      {error && <p className="text-body text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <InlineForm.Cancel />
        <Button size="sm" onClick={save} disabled={busy || !body.trim()}>
          {m.comments_save_button()}
        </Button>
      </div>
    </>
  )
}
