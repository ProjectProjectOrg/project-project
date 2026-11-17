import { useAtomValue } from "@effect/atom-react"
import type { TicketId, User } from "@pp/shared"
import { Button } from "@pp/ui/button"
import { CommentComposer as Composer } from "@pp/ui/comment"
import { LexicalEditor } from "@pp/ui/editor/lexical-editor"
import * as Result from "effect/reactivity/AsyncResult"

import { me } from "@/features/auth/atoms/auth"
import { useCommentDraft } from "@/features/comments/hooks/useCommentDraft"
import { m } from "@/paraglide/messages"

const SETTLE_FRAMES = 30

const scrollParent = (element: HTMLElement): HTMLElement | null => {
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (/auto|scroll/.test(getComputedStyle(node).overflowY)) return node
  }
  return null
}

const keepInView = (element: HTMLElement | null) => {
  const scroller = element === null ? null : scrollParent(element)
  if (element === null || scroller === null) return
  let frames = 0
  const tick = () => {
    const hidden =
      element.getBoundingClientRect().bottom >
      scroller.getBoundingClientRect().bottom
    if (hidden) scroller.scrollTop = scroller.scrollHeight
    if (++frames < SETTLE_FRAMES) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

export function CommentComposer({
  ticketId
}: Readonly<{ ticketId: TicketId }>) {
  const viewer = useAtomValue(me())
  if (!Result.isSuccess(viewer)) return null
  return <ReadyCommentComposer ticketId={ticketId} author={viewer.value} />
}

function ReadyCommentComposer({
  ticketId,
  author
}: Readonly<{ ticketId: TicketId; author: User }>) {
  const { body, setBody, editorKey, focusEditor, submit, rootRef } =
    useCommentDraft({ ticketId, author, onSend: keepInView })

  return (
    <Composer
      ref={rootRef}
      submit={
        <Button size="sm" onClick={submit} disabled={!body.trim()}>
          {m.comments_composer_submit()}
        </Button>
      }
    >
      <LexicalEditor
        key={editorKey}
        markdown={body}
        onDraftChange={setBody}
        onSubmit={submit}
        placeholder={m.comments_composer_placeholder()}
        autoFocus={focusEditor}
        compact
      />
    </Composer>
  )
}
