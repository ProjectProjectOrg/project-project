import { useAtomValue } from "@effect/atom-react"
import type { TicketId } from "@pp/shared"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { AnimatePresence } from "motion/react"
import { useState } from "react"

import { CollapsibleSection } from "@/components/TicketPage/CollapsibleSection"
import { comments, commentsRequest } from "@/features/comments/atoms/comments"
import { MentionScopeProvider } from "@/mentions/scope"
import { m } from "@/paraglide/messages"
import { useProject } from "@/routes/_authed/orgs/$orgSlug/projects/$slug/-context"

import { CommentComposer } from "./CommentComposer"
import { CommentRow } from "./CommentRow"

const INITIAL_VISIBLE = 3

export function CommentsSection({
  orgSlug,
  slug,
  ticketId
}: {
  orgSlug: string
  slug: string
  ticketId: TicketId
}) {
  const req = commentsRequest(orgSlug, slug, ticketId)
  const result = useAtomValue(comments(req))
  const project = useProject()
  const [showAll, setShowAll] = useState(false)

  const rows = Result.isSuccess(result) ? result.value : []
  const total = rows.length
  const ordered = rows.toReversed()
  const visibleSlice =
    showAll || total <= INITIAL_VISIBLE
      ? ordered
      : ordered.slice(0, INITIAL_VISIBLE)
  const hidden = total - visibleSlice.length

  const headingLabel =
    total > 0
      ? m.comments_heading_with_count({ count: total })
      : m.comments_heading()

  return (
    <MentionScopeProvider scope={{ orgSlug, slug, members: project.members }}>
      <CollapsibleSection heading={headingLabel}>
        <div className="mb-3">
          <CommentComposer orgSlug={orgSlug} slug={slug} ticketId={ticketId} />
        </div>
        <div className="space-y-3">
          {Result.isSuccess(result) && total === 0 && (
            <p className="text-sm text-muted-foreground">
              {m.comments_empty()}
            </p>
          )}
          {visibleSlice.map((row) => (
            <AnimatePresence key={row.key} initial={true}>
              <CommentRow
                comment={row.comment}
                pending={row.pending}
                orgSlug={orgSlug}
                slug={slug}
                ticketId={ticketId}
              />
            </AnimatePresence>
          ))}
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {hidden === 1
                ? m.comments_show_older_one()
                : m.comments_show_older_many({ count: hidden })}
            </button>
          )}
          {Result.isFailure(result) && (
            <p className="text-sm text-destructive">
              {m.comments_load_failed()}
            </p>
          )}
        </div>
      </CollapsibleSection>
    </MentionScopeProvider>
  )
}
