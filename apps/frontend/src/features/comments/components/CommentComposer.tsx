import { useAtomValue } from "@effect/atom-react"
import type { TicketId, User } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"

import { Button } from "@/components/ui/button"
import { me } from "@/features/auth/atoms/auth"
import { useCommentDraft } from "@/features/comments/hooks/useCommentDraft"
import { LexicalEditor } from "@/features/editor/components/LexicalEditor"
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
  const { body, setBody, editorKey, focusEditor, failed, submit, rootRef } =
    useCommentDraft({ ticketId, author, onSend: keepInView })

  return (
    <div
      ref={rootRef}
      className="rounded-xl border border-border/60 bg-background [--fs-body:13px] [--lh-body:20px] [--text-body--line-height:20px] [--text-body:13px]"
    >
      <div className="px-4 pt-3.5">
        <LexicalEditor
          key={editorKey}
          markdown={body}
          onDraftChange={setBody}
          onSubmit={submit}
          placeholder={m.comments_composer_placeholder()}
          autoFocus={focusEditor}
          compact
        />
      </div>
      {failed && (
        <p role="alert" className="mx-4 mt-2 text-body text-destructive">
          {m.comments_composer_failed()}
        </p>
      )}
      <div className="flex justify-end p-1.5">
        <Button size="sm" onClick={submit} disabled={!body.trim()}>
          {m.comments_composer_submit()}
        </Button>
      </div>
    </div>
  )
}
