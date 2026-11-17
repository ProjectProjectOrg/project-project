import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { CommentId, TicketId, User } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Random from "effect/Random"
import * as Result from "effect/reactivity/AsyncResult"
import { useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { me } from "@/features/auth/atoms/auth"
import {
  commentsRequest,
  createComment
} from "@/features/comments/atoms/comments"
import { LexicalEditor } from "@/features/editor/components/LexicalEditor"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

const newCommentIdentity = () => ({
  clientId: Effect.runSync(Random.next).toString(36),
  createdAt: DateTime.toDate(DateTime.nowUnsafe())
})

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

type Reply = Readonly<{ to: CommentId; onClose: () => void }>

type ComposerProps = Readonly<{ ticketId: TicketId; reply?: Reply }>

export function CommentComposer(props: ComposerProps) {
  const viewer = useAtomValue(me())
  if (!Result.isSuccess(viewer)) return null
  return <ReadyCommentComposer {...props} author={viewer.value} />
}

function ReadyCommentComposer({
  ticketId,
  reply,
  author
}: ComposerProps & Readonly<{ author: User }>) {
  const { orgSlug, slug } = useProjectRoute()
  const [body, setBody] = useState("")
  const [editorVersion, setEditorVersion] = useState(0)
  const [focusEditor, setFocusEditor] = useState(reply !== undefined)
  const [identity, setIdentity] = useState(newCommentIdentity)
  const [failed, setFailed] = useState(false)
  const req = commentsRequest(orgSlug, slug, ticketId)
  const create = useAtomSet(createComment({ req, author, ...identity }), {
    mode: "promiseExit"
  })

  const rootRef = useRef<HTMLDivElement>(null)

  const reset = (next: string, focus: boolean) => {
    setBody(next)
    setFocusEditor(focus)
    setEditorVersion((v) => v + 1)
  }

  const submit = async () => {
    if (!body.trim()) return
    const sent = body
    setFailed(false)
    reset("", true)
    setIdentity(newCommentIdentity())
    const pending = create(
      reply === undefined ? { body: sent } : { body: sent, replyTo: reply.to }
    )
    keepInView(rootRef.current)
    const exit = await pending
    if (Exit.isSuccess(exit)) return reply?.onClose()
    setFailed(true)
    reset(sent, rootRef.current?.contains(document.activeElement) ?? false)
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        "[--fs-body:13px] [--lh-body:20px] [--text-body--line-height:20px] [--text-body:13px]",
        reply === undefined
          ? "rounded-xl border border-border/60 bg-background"
          : "border-t border-border/60"
      )}
    >
      <div className="px-4 pt-3.5">
        <LexicalEditor
          key={editorVersion}
          markdown={body}
          onDraftChange={setBody}
          onSubmit={submit}
          placeholder={
            reply === undefined
              ? m.comments_composer_placeholder()
              : m.comments_reply_placeholder()
          }
          autoFocus={focusEditor}
          compact
        />
      </div>
      {failed && (
        <p role="alert" className="mx-4 mt-2 text-body text-destructive">
          {m.comments_composer_failed()}
        </p>
      )}
      <div className="flex justify-end gap-2 p-1.5">
        {reply !== undefined && (
          <Button size="sm" variant="ghost" onClick={reply.onClose}>
            {m.common_cancel_button()}
          </Button>
        )}
        <Button size="sm" onClick={submit} disabled={!body.trim()}>
          {reply === undefined
            ? m.comments_composer_submit()
            : m.comments_reply_submit()}
        </Button>
      </div>
    </div>
  )
}
