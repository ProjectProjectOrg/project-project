import { useState } from "react"
import { useAtomSet } from "@effect-atom/atom-react"
import { Button } from "@/components/ui/button"
import { LexicalEditor } from "@/components/LexicalEditor"
import { commentsKey, createCommentAtom } from "@/atoms/comments"
import { MentionScopeProvider } from "@/mentions/scope"
import type { TicketId } from "@projectproject/shared"

export function CommentComposer({
  orgSlug,
  slug,
  ticketId
}: {
  orgSlug: string
  slug: string
  ticketId: TicketId
}) {
  const [body, setBody] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const create = useAtomSet(
    createCommentAtom(commentsKey(orgSlug, slug, ticketId)),
    { mode: "promise" }
  )

  const submit = async () => {
    if (!body.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      await create({ body })
      setBody("")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to post comment.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-border space-y-2 rounded-md border p-3">
      <MentionScopeProvider scope={{ orgSlug, slug }}>
        <LexicalEditor
          markdown={body}
          onChange={(md) => setBody(md)}
          placeholder="Write a comment…"
        />
      </MentionScopeProvider>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="flex justify-end">
        <Button onClick={submit} disabled={busy || !body.trim()}>
          Comment
        </Button>
      </div>
    </div>
  )
}
