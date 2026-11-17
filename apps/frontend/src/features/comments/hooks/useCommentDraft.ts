import { useAtomSet } from "@effect/atom-react"
import type { CommentId, TicketId, User } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Random from "effect/Random"
import { useRef, useState } from "react"

import {
  commentsRequest,
  createComment
} from "@/features/comments/atoms/comments"
import { useProjectRoute } from "@/features/projects/hooks/useProject"

const newCommentIdentity = () => ({
  clientId: Effect.runSync(Random.next).toString(36),
  createdAt: DateTime.toDate(DateTime.nowUnsafe())
})

export function useCommentDraft({
  ticketId,
  author,
  replyTo,
  onSend
}: Readonly<{
  ticketId: TicketId
  author: User
  replyTo?: CommentId
  onSend?: (root: HTMLDivElement | null) => void
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const [body, setBody] = useState("")
  const [editorVersion, setEditorVersion] = useState(0)
  const [focusEditor, setFocusEditor] = useState(false)
  const [identity, setIdentity] = useState(newCommentIdentity)
  const [failed, setFailed] = useState(false)
  const create = useAtomSet(
    createComment({
      req: commentsRequest(orgSlug, slug, ticketId),
      author,
      ...identity
    }),
    { mode: "promiseExit" }
  )
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
      replyTo === undefined ? { body: sent } : { body: sent, replyTo }
    )
    onSend?.(rootRef.current)
    if (Exit.isSuccess(await pending)) return
    setFailed(true)
    reset(sent, rootRef.current?.contains(document.activeElement) ?? false)
  }

  return {
    body,
    setBody,
    editorKey: editorVersion,
    focusEditor,
    failed,
    submit,
    rootRef
  }
}
