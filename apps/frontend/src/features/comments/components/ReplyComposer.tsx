import { useAtomValue } from "@effect/atom-react"
import type { CommentId, TicketId, User } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import { useState, type FocusEvent } from "react"

import { Button } from "@/components/ui/button"
import { me } from "@/features/auth/atoms/auth"
import { useCommentDraft } from "@/features/comments/hooks/useCommentDraft"
import { LexicalEditor } from "@/features/editor/components/LexicalEditor"
import { MemberAvatar } from "@/features/members/components/MemberAvatar"
import { m } from "@/paraglide/messages"

type ReplyProps = Readonly<{ ticketId: TicketId; replyTo: CommentId }>

export function ReplyComposer(props: ReplyProps) {
  const viewer = useAtomValue(me())
  if (!Result.isSuccess(viewer)) return null
  return <ReadyReplyComposer {...props} author={viewer.value} />
}

function ReadyReplyComposer({
  ticketId,
  replyTo,
  author
}: ReplyProps & Readonly<{ author: User }>) {
  const { body, setBody, editorKey, failed, submit, rootRef } = useCommentDraft(
    { ticketId, author, replyTo }
  )
  const [open, setOpen] = useState(false)
  const ready = body.trim() !== ""

  const closeWhenEmpty = (event: FocusEvent<HTMLDivElement>) => {
    const leaving = !event.currentTarget.contains(event.relatedTarget)
    if (leaving && !ready && !failed) setOpen(false)
  }

  return (
    <div
      ref={rootRef}
      onBlur={closeWhenEmpty}
      className="flex items-end gap-2 rounded-b-xl border-t border-border/60 py-2.5 pr-2.5 pl-4 [--fs-body:13px] [--lh-body:20px] [--text-body--line-height:20px] [--text-body:13px]"
    >
      <MemberAvatar member={author} size={20} className="mt-1.5 self-start" />
      <div className="min-w-0 flex-1 pt-1.5 pb-0.5">
        {open ? (
          <LexicalEditor
            key={editorKey}
            markdown={body}
            onDraftChange={setBody}
            onSubmit={submit}
            placeholder={m.comments_reply_placeholder()}
            // oxlint-disable-next-line jsx-a11y/no-autofocus -- focus follows the click that opened the reply box
            autoFocus
            compact
          />
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex min-h-6 w-full cursor-text items-start text-left text-body text-muted-foreground"
          >
            {m.comments_reply_placeholder()}
          </button>
        )}
        {failed && (
          <p role="alert" className="mt-1 text-body text-destructive">
            {m.comments_composer_failed()}
          </p>
        )}
      </div>
      <Button size="sm" onClick={submit} disabled={!ready} className="mb-0.5">
        {m.comments_reply_submit()}
      </Button>
    </div>
  )
}
