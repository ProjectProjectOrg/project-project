import { useAtomValue, Result } from "@effect-atom/atom-react"
import { commentsAtom, commentsKey } from "@/atoms/comments"
import type { TicketId } from "@projectproject/shared"
import { CommentRow } from "./CommentRow"
import { CommentComposer } from "./CommentComposer"

export function CommentsSection({
  orgSlug,
  slug,
  ticketId
}: {
  orgSlug: string
  slug: string
  ticketId: TicketId
}) {
  const key = commentsKey(orgSlug, slug, ticketId)
  const result = useAtomValue(commentsAtom(key))

  return (
    <section className="mt-8 space-y-4">
      <h2 className="text-lg font-semibold">Comments</h2>
      <div className="space-y-3">
        {Result.isSuccess(result) && result.value.length === 0 && (
          <p className="text-muted-foreground text-sm">No comments yet.</p>
        )}
        {Result.isSuccess(result) &&
          result.value.map((c) => (
            <CommentRow
              key={c.id}
              comment={c}
              waiting={Boolean(result.waiting)}
              orgSlug={orgSlug}
              slug={slug}
              ticketId={ticketId}
            />
          ))}
        {Result.isFailure(result) && (
          <p className="text-destructive text-sm">Failed to load comments.</p>
        )}
      </div>
      <CommentComposer orgSlug={orgSlug} slug={slug} ticketId={ticketId} />
    </section>
  )
}
