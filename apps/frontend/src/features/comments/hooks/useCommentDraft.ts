import { RegistryContext } from "@effect/atom-react"
import type { CommentId, TicketId, User } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Random from "effect/Random"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { useContext, useRef, useState } from "react"

import { fireMutation } from "@/api/viewMutation"
import {
  commentsRequest,
  createComment,
  parkFailedComment
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
  const registry = useContext(RegistryContext)
  const req = commentsRequest(orgSlug, slug, ticketId)
  const rootRef = useRef<HTMLDivElement>(null)

  const reset = (next: string, focus: boolean) => {
    setBody(next)
    setFocusEditor(focus)
    setEditorVersion((v) => v + 1)
  }

  // The comment goes into the thread at once; if sending fails it stays
  // there, failed, with Retry (the outbox), and the editor stays clear.
  const submit = async () => {
    if (!body.trim()) return
    const input = replyTo === undefined ? { body } : { body, replyTo }
    const sent = newCommentIdentity()
    reset("", true)
    const pending = fireMutation(
      registry,
      createComment({ req, author, ...sent }),
      input
    )
    onSend?.(rootRef.current)
    if (AsyncResult.isSuccess(await pending)) return
    parkFailedComment(registry, req, { ...sent, author, input })
  }

  return {
    body,
    setBody,
    editorKey: editorVersion,
    focusEditor,
    submit,
    rootRef
  }
}
