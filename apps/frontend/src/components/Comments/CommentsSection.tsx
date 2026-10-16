import { useAtomValue } from "@effect/atom-react"
import type { TicketId } from "@pp/shared"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { ChevronRight } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import { useState } from "react"

import {
  SEGMENTED_ITEM_CLASS,
  SegmentedTabs,
  type SegmentedItem
} from "@/components/SegmentedTabs"
import { TicketActivityFeed } from "@/components/TicketActivity/TicketActivityFeed"
import { comments, commentsRequest } from "@/features/comments/atoms/comments"
import { useProjectActor } from "@/lib/access"
import { transitions } from "@/lib/springs"
import { MentionScopeProvider } from "@/mentions/scope"
import { m } from "@/paraglide/messages"
import { useProject } from "@/routes/_authed/orgs/$orgSlug/projects/$slug/-context"

import { CommentComposer } from "./CommentComposer"
import { CommentRow } from "./CommentRow"

const INITIAL_VISIBLE = 3

type DiscussionTab = "comments" | "activity"

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
  const canComment = useProjectActor().call("ticketComments", "create")
  const [collapsed, setCollapsed] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [tab, setTab] = useState<DiscussionTab>("comments")

  const rows = Result.isSuccess(result) ? result.value : []
  const total = rows.length
  const ordered = rows.toReversed()
  const visibleSlice =
    showAll || total <= INITIAL_VISIBLE
      ? ordered
      : ordered.slice(0, INITIAL_VISIBLE)
  const hidden = total - visibleSlice.length

  const tabs: ReadonlyArray<SegmentedItem<DiscussionTab>> = [
    {
      key: "comments",
      label: m.tickets_activity_tab_comments(),
      badge: total > 0 ? total : null
    },
    { key: "activity", label: m.tickets_activity_tab() }
  ]

  const headingLabel =
    total > 0
      ? m.comments_heading_with_count({ count: total })
      : m.comments_heading()

  return (
    <MentionScopeProvider scope={{ orgSlug, slug, members: project.members }}>
      <section className="mt-8 space-y-4">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="-ml-1.5 grid size-7 place-items-center rounded-md text-muted-foreground transition-[color,transform] duration-100 hover:text-foreground active:scale-[0.97]"
            aria-expanded={!collapsed}
            aria-label={headingLabel}
          >
            <ChevronRight
              className={
                "size-4 transition-transform duration-200 " +
                (collapsed ? "" : "rotate-90")
              }
            />
          </button>
          <div role="group" aria-label={m.tickets_activity_tabs_aria_label()}>
            <SegmentedTabs
              items={tabs}
              isActive={(key) => key === tab}
              renderItem={(item, content, { active }) => (
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setTab(item.key)
                    setCollapsed(false)
                  }}
                  className={SEGMENTED_ITEM_CLASS(active)}
                >
                  {content}
                </button>
              )}
            />
          </div>
        </div>
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
              {tab === "activity" ? (
                <TicketActivityFeed
                  orgSlug={orgSlug}
                  slug={slug}
                  ticketId={ticketId}
                />
              ) : (
                <>
                  {canComment && (
                    <div className="mb-3">
                      <CommentComposer
                        orgSlug={orgSlug}
                        slug={slug}
                        ticketId={ticketId}
                      />
                    </div>
                  )}
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
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </MentionScopeProvider>
  )
}
