import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { TicketId, User } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Random from "effect/Random"
import * as Result from "effect/reactivity/AsyncResult"
import { useState } from "react"

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
  const [identity, setIdentity] = useState(newCommentIdentity)
  const req = commentsRequest(orgSlug, slug, ticketId)
  const createAtom = createComment({ req, author, ...identity })
  const create = useAtomSet(createAtom, { mode: "promiseExit" })
  const createState = useAtomValue(createAtom)
  const submitting = createState.waiting
  const error = Result.isFailure(createState)
    ? m.comments_composer_failed()
    : null

  const submit = async () => {
    if (!body.trim() || submitting) return
    const exit = await create({ body })
    if (Exit.isSuccess(exit)) {
      setBody("")
      setEditorVersion((v) => v + 1)
      setIdentity(newCommentIdentity())
    }
  }

  return (
    <div className="rounded-md border border-border bg-background px-3 py-3">
      <LexicalEditor
        key={editorVersion}
        markdown={body}
        onChange={(md) => setBody(md)}
        placeholder={m.comments_composer_placeholder()}
        compact
      />
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      <div className="mt-2 flex justify-end">
        <Button
          size="sm"
          onClick={submit}
          disabled={submitting || !body.trim()}
          className={submitting ? "animate-pulse" : undefined}
        >
          {m.comments_composer_submit()}
        </Button>
      </div>
    </div>
  )
}
