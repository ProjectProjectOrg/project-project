import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { TicketId, User } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Random from "effect/Random"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { motion, AnimatePresence } from "motion/react"
import { useState } from "react"

import { LexicalEditor } from "@/components/LexicalEditor"
import { Button } from "@/components/ui/button"
import { me } from "@/features/auth/atoms/auth"
import {
  commentsRequest,
  createComment
} from "@/features/comments/atoms/comments"
import { transitions } from "@/lib/springs"
import { m } from "@/paraglide/messages"

const newCommentIdentity = () => ({
  clientId: Effect.runSync(Random.next).toString(36),
  createdAt: DateTime.toDate(DateTime.nowUnsafe())
})

export function CommentComposer({
  orgSlug,
  slug,
  ticketId
}: {
  orgSlug: string
  slug: string
  ticketId: TicketId
}) {
  const viewer = useAtomValue(me())
  if (!Result.isSuccess(viewer)) return null
  return (
    <ReadyCommentComposer
      orgSlug={orgSlug}
      slug={slug}
      ticketId={ticketId}
      author={viewer.value}
    />
  )
}

function ReadyCommentComposer({
  orgSlug,
  slug,
  ticketId,
  author
}: {
  orgSlug: string
  slug: string
  ticketId: TicketId
  author: User
}) {
  const [body, setBody] = useState("")
  const [expanded, setExpanded] = useState(false)
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
      setExpanded(false)
      setIdentity(newCommentIdentity())
    }
  }

  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget)) return
    if (!body.trim()) setExpanded(false)
  }

  return (
    <motion.div
      onFocus={() => setExpanded(true)}
      onBlur={handleBlur}
      animate={{
        paddingTop: expanded ? 12 : 6,
        paddingBottom: expanded ? 12 : 6
      }}
      transition={transitions.layout}
      className="rounded-md border border-border bg-background px-3"
    >
      <LexicalEditor
        key={editorVersion}
        markdown={body}
        onChange={(md) => setBody(md)}
        placeholder={m.comments_composer_placeholder()}
        compact
      />
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="actions"
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 8 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={transitions.presence}
            className="overflow-hidden"
          >
            {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={submit}
                disabled={submitting || !body.trim()}
                className={submitting ? "animate-pulse" : undefined}
              >
                {m.comments_composer_submit()}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
