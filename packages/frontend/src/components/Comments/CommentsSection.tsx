import { useState } from "react"
import { useAtomValue, Result } from "@effect-atom/atom-react"
import { motion, AnimatePresence } from "motion/react"
import { ChevronRight } from "lucide-react"
import { commentsAtom, commentsKey } from "@/atoms/comments"
import { useProject } from "@/routes/_authed/orgs/$orgSlug/projects/$slug/-context"
import { MentionScopeProvider } from "@/mentions/scope"
import { m } from "@/paraglide/messages"
import type { TicketId } from "@projectproject/shared"
import { CommentRow } from "./CommentRow"
import { CommentComposer } from "./CommentComposer"

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
  const key = commentsKey(orgSlug, slug, ticketId)
  const result = useAtomValue(commentsAtom(key))
  const project = useProject()
  const [collapsed, setCollapsed] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const comments = Result.isSuccess(result) ? result.value : []
  const total = comments.length
  const ordered = [...comments].reverse()
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
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="overflow-hidden"
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
                  <p className="text-muted-foreground text-sm">
                    {m.comments_empty()}
                  </p>
                )}
                {visibleSlice.map((c) => (
                  <AnimatePresence initial={true}>
                    <CommentRow
                      key={c.id}
                      comment={c}
                      waiting={result.waiting}
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
                    className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                  >
                    {hidden === 1
                      ? m.comments_show_older_one()
                      : m.comments_show_older_many({ count: hidden })}
                  </button>
                )}
                {Result.isFailure(result) && (
                  <p className="text-destructive text-sm">
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
