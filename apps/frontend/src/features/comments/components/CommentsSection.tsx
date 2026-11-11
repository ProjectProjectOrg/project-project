import { useAtomMount, useAtomValue } from "@effect/atom-react"
import type { TicketId } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import { ChevronRight } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import { useState, type ReactNode } from "react"

import {
  SegmentedTabs,
  type SegmentedItem
} from "@/components/ui/segmented-tabs"
import { comments, commentsRequest } from "@/features/comments/atoms/comments"
import { MentionScopeProvider } from "@/features/editor/mentions/scope"
import {
  useProject,
  useProjectRoute
} from "@/features/projects/hooks/useProject"
import {
  ticketActivity,
  ticketActivityRequest
} from "@/features/tickets/atoms/ticketActivity"
import { TicketTimeline } from "@/features/tickets/components/TicketTimeline"
import { useTicketParticipants } from "@/features/tickets/hooks/useTicketParticipants"
import { useProjectActor } from "@/hooks/useActor"
import { transitions } from "@/lib/springs"
import { m } from "@/paraglide/messages"

import { CommentComposer } from "./CommentComposer"
import { CommentRow } from "./CommentRow"

type DiscussionTab = "extra" | "activity"

export type ExtraTab = Readonly<{
  label: string
  badge: number | null
  content: ReactNode
  placement: "first" | "last"
}>

export function CommentsSection({
  ticketId,
  extraTab
}: Readonly<{ ticketId: TicketId; extraTab?: ExtraTab }>) {
  const { orgSlug, slug } = useProjectRoute()
  const req = commentsRequest(orgSlug, slug, ticketId)
  const result = useAtomValue(comments(req))
  useAtomMount(ticketActivity(ticketActivityRequest(orgSlug, slug, ticketId)))
  const project = useProject()
  const involved = useTicketParticipants(ticketId)
  const canComment = useProjectActor().call("ticketComments", "create")
  const [collapsed, setCollapsed] = useState(false)
  const [tab, setTab] = useState<DiscussionTab>(
    extraTab?.placement === "first" ? "extra" : "activity"
  )

  const rows = Result.isSuccess(result) ? result.value : []
  const total = rows.length

  const extraItems: ReadonlyArray<SegmentedItem<DiscussionTab>> = extraTab
    ? [{ key: "extra", label: extraTab.label, badge: extraTab.badge }]
    : []
  const tabs: ReadonlyArray<SegmentedItem<DiscussionTab>> = [
    ...(extraTab?.placement === "first" ? extraItems : []),
    { key: "activity", label: m.tickets_activity_tab() },
    ...(extraTab?.placement === "last" ? extraItems : [])
  ]

  const headingLabel =
    total > 0
      ? m.comments_heading_with_count({ count: total })
      : m.comments_heading()

  return (
    <MentionScopeProvider
      scope={{ orgSlug, slug, members: project.members, involved }}
    >
      <section className="mt-8 space-y-4">
        <div className="relative flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="-ml-1.5 grid size-7 place-items-center rounded-md text-muted-foreground transition-[color,transform] duration-100 hover:text-foreground active:scale-[0.97] sm:absolute sm:top-1/2 sm:left-[calc(var(--ticket-status-column)/2-var(--ticket-rail-inset))] sm:ml-0 sm:-translate-1/2"
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
          <SegmentedTabs
            aria-label={m.tickets_activity_tabs_aria_label()}
            items={tabs}
            value={tab}
            onValueChange={(next) => {
              setTab(next)
              setCollapsed(false)
            }}
          />
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
              {tab === "extra" && extraTab ? (
                extraTab.content
              ) : (
                <div className="space-y-4">
                  <TicketTimeline
                    ticketId={ticketId}
                    comments={rows.map((row) => ({
                      key: row.key,
                      at: row.comment.createdAt,
                      value: row
                    }))}
                    renderComment={({ value: row }) => (
                      <AnimatePresence initial={true}>
                        <CommentRow
                          comment={row.comment}
                          pending={row.pending}
                          ticketId={ticketId}
                        />
                      </AnimatePresence>
                    )}
                  />
                  {Result.isFailure(result) && (
                    <p className="text-body text-destructive">
                      {m.comments_load_failed()}
                    </p>
                  )}
                  {canComment && <CommentComposer ticketId={ticketId} />}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </MentionScopeProvider>
  )
}
