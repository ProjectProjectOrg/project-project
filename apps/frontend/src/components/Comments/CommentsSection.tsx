import { useAtomValue } from "@effect/atom-react"
import type { TicketId } from "@pp/shared"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { ChevronRight } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import { useState } from "react"

import { comments, commentsRequest } from "@/features/comments/atoms/comments"
import { transitions } from "@/lib/springs"
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
  const [collapsed, setCollapsed] = useState(false)
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
      <section className="mt-8 space-y-4">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="group flex items-center gap-2 text-lg font-semibold transition-colors hover:text-muted-foreground"
          aria-expanded={!collapsed}
        >
          <ChevronRight
            className={
              "size-4 transition-transform duration-200 " +
              (collapsed ? "" : "rotate-90")
            }
          />
          <span>{headingLabel}</span>
        </button>
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              key="body"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={transitions.layout}
              className="overflow-y-clip"
            >
              <div className="mb-3">
                <CommentComposer
                  orgSlug={orgSlug}
                  slug={slug}
                  ticketId={ticketId}
                />
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
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </MentionScopeProvider>
  )
}
