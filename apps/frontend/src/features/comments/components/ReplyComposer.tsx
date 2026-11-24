import { useAtomValue } from "@effect/atom-react"
import type { CommentId, TicketId, User } from "@pp/shared"
import { Button } from "@pp/ui/button"
import { CommentReplyBox } from "@pp/ui/comment"
import { MemberAvatar } from "@pp/ui/member-avatar"
import * as DateTime from "effect/DateTime"
import * as Result from "effect/reactivity/AsyncResult"
import { useState, type FocusEvent } from "react"

import { me } from "@/features/auth/atoms/auth"
import { useCommentDraft } from "@/features/comments/hooks/useCommentDraft"
import { LexicalEditor } from "@/features/editor/components/LexicalEditor"
import { TimelineTime } from "@/features/tickets/components/TimelineTime"
import { m } from "@/paraglide/messages"

type ReplyProps = Readonly<{
  ticketId: TicketId
  replyTo: CommentId
  // Leaving the box empty closes it again.
  onClose: () => void
  onSent: () => void
}>

export function ReplyComposer(props: ReplyProps) {
  const viewer = useAtomValue(me())
  if (!Result.isSuccess(viewer)) return null
  return <ReadyReplyComposer {...props} author={viewer.value} />
}

function ReadyReplyComposer({
  ticketId,
  replyTo,
  onClose,
  onSent,
  author
}: ReplyProps & Readonly<{ author: User }>) {
  const { body, setBody, editorKey, submit, rootRef } = useCommentDraft({
    ticketId,
    author,
    replyTo,
    onSend: onSent
  })
  const [openedAt] = useState(() => DateTime.toDate(DateTime.nowUnsafe()))
  const ready = body.trim() !== ""

  const closeWhenEmpty = (event: FocusEvent<HTMLDivElement>) => {
    const leaving = !event.currentTarget.contains(event.relatedTarget)
    if (leaving && !ready) onClose()
  }

  return (
    <CommentReplyBox
      ref={rootRef}
      onBlur={closeWhenEmpty}
      mark={<MemberAvatar member={author} size={20} />}
      author={author.name || author.email}
      time={<TimelineTime at={openedAt} />}
      submit={
        <Button size="sm" onClick={submit} disabled={!ready}>
          {m.comments_reply_submit()}
        </Button>
      }
    >
      <LexicalEditor
        key={editorKey}
        markdown={body}
        onDraftChange={setBody}
        onSubmit={submit}
        placeholder={m.comments_reply_placeholder()}
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- focus follows the click on Reply that opened the box
        autoFocus={editorKey === 0}
        compact
      />
    </CommentReplyBox>
  )
}
