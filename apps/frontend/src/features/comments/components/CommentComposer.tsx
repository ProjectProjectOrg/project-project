import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { TicketId, User } from "@pp/shared"
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

export function CommentComposer({ ticketId }: { ticketId: TicketId }) {
  const viewer = useAtomValue(me())
  if (!Result.isSuccess(viewer)) return null
  return <ReadyCommentComposer ticketId={ticketId} author={viewer.value} />
}

function ReadyCommentComposer({
  ticketId,
  author
}: {
  ticketId: TicketId
  author: User
}) {
  const { orgSlug, slug } = useProjectRoute()
  const [body, setBody] = useState("")
  const [editorVersion, setEditorVersion] = useState(0)
  const [focusEditor, setFocusEditor] = useState(false)
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
    const pending = create({ body: sent })
    keepInView(rootRef.current)
    const exit = await pending
    if (Exit.isFailure(exit)) {
      setFailed(true)
      reset(sent, rootRef.current?.contains(document.activeElement) ?? false)
    }
  }

  return (
    <div
      ref={rootRef}
      className="rounded-md border border-border bg-background px-3 py-3"
    >
      <LexicalEditor
        key={editorVersion}
        markdown={body}
        onDraftChange={setBody}
        onSubmit={submit}
        placeholder={m.comments_composer_placeholder()}
        autoFocus={focusEditor}
        compact
      />
      {failed && (
        <p role="alert" className="mt-2 text-body text-destructive">
          {m.comments_composer_failed()}
        </p>
      )}
      <div className="mt-2 flex justify-end">
        <Button size="sm" onClick={submit} disabled={!body.trim()}>
          {m.comments_composer_submit()}
        </Button>
      </div>
    </div>
  )
}
