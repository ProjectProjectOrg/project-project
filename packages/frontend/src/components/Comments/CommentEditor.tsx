import { useState } from "react"
import { useAtomSet } from "@effect-atom/atom-react"
import { Button } from "@/components/ui/button"
import { LexicalEditor } from "@/components/LexicalEditor"
import { commentsKey, editCommentAtom } from "@/atoms/comments"
import { MentionScopeProvider } from "@/mentions/scope"
import type { Comment, TicketId } from "@projectproject/shared"

export function CommentEditor({
  comment,
  orgSlug,
  slug,
  ticketId,
  onDone
}: {
  comment: Comment
  orgSlug: string
  slug: string
  ticketId: TicketId
  onDone: () => void
}) {
  const [body, setBody] = useState(comment.body)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const edit = useAtomSet(
    editCommentAtom(commentsKey(orgSlug, slug, ticketId)),
    { mode: "promise" }
  )

  const save = async () => {
    if (!body.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      await edit({ commentId: comment.id, body })
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.")
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
          autoFocus
        />
      </MentionScopeProvider>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={save} disabled={busy || !body.trim()}>
          Save
        </Button>
      </div>
    </div>
  )
}
