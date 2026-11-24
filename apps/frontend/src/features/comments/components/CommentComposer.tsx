import { useAtomValue } from "@effect/atom-react"
import type { TicketId, User } from "@pp/shared"
import { Button } from "@pp/ui/button"
import { CommentComposer as Composer } from "@pp/ui/comment"
import * as Result from "effect/reactivity/AsyncResult"
import { useId, useRef, useState } from "react"

import { me } from "@/features/auth/atoms/auth"
import { useCommentDraft } from "@/features/comments/hooks/useCommentDraft"
import { loadLexicalEditor } from "@/features/editor/components/LexicalEditor"
import { m } from "@/paraglide/messages"

const SETTLE_FRAMES = 30

const scrollParent = (element: HTMLElement) => {
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

  const [Editor, setEditor] = useState<Awaited<
    ReturnType<typeof loadLexicalEditor>
  > | null>(null)
  const [focusOnLoad, setFocusOnLoad] = useState(false)
  const loading = useRef(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const submitHint = useId()
  const openEditor = () => {
    if (loading.current) return
    loading.current = true
    void loadLexicalEditor()
      .then((loaded) => {
        if (inputRef.current === null) return
        setFocusOnLoad(document.activeElement === inputRef.current)
        setEditor(() => loaded)
      })
      .catch(() => {})
      .finally(() => {
        loading.current = false
      })
  }

  return (
    <Composer
      ref={rootRef}
      submit={
        <Button size="sm" onClick={submit} disabled={!body.trim()}>
          {m.comments_composer_submit()}
        </Button>
      }
    >
      {Editor === null ? (
        <>
          <textarea
            ref={inputRef}
            rows={1}
            value={body}
            aria-label={m.comments_composer_placeholder()}
            aria-describedby={submitHint}
            placeholder={m.comments_composer_placeholder()}
            className="block w-full resize-none bg-transparent text-body outline-none placeholder:text-muted-foreground"
            onFocus={openEditor}
            onChange={(event) => setBody(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey))
                return
              event.preventDefault()
              void submit()
            }}
          />
          <span id={submitHint} className="sr-only">
            {m.editor_submit_hint()}
          </span>
        </>
      ) : (
        <Editor
          key={editorKey}
          markdown={body}
          onDraftChange={setBody}
          onSubmit={submit}
          placeholder={m.comments_composer_placeholder()}
          autoFocus={focusOnLoad || focusEditor}
          compact
        />
      )}
    </Composer>
  )
}
