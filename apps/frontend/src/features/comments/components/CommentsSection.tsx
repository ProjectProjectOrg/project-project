import { useAtomMount, useAtomValue } from "@effect/atom-react"
import type { TicketId } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import { ArrowDownWideNarrow, ArrowUpNarrowWide } from "lucide-react"
import { AnimatePresence } from "motion/react"

import { Button } from "@/components/ui/button"
import { comments, commentsRequest } from "@/features/comments/atoms/comments"
import { MentionScopeProvider } from "@/features/editor/mentions/scope"
import {
  useProject,
  useProjectRoute
} from "@/features/projects/hooks/useProject"
import { SubscribeToggle } from "@/features/subscriptions/components/SubscribeToggle"
import {
  ticketActivity,
  ticketActivityRequest
} from "@/features/tickets/atoms/ticketActivity"
import { TicketTimeline } from "@/features/tickets/components/TicketTimeline"
import { useActivityOrder } from "@/features/tickets/hooks/useActivityOrder"
import { useTicketParticipants } from "@/features/tickets/hooks/useTicketParticipants"
import { useProjectActor } from "@/hooks/useActor"
import { m } from "@/paraglide/messages"

import { CommentComposer } from "./CommentComposer"
import { CommentRow } from "./CommentRow"

export function CommentsSection({
  ticketId
}: Readonly<{ ticketId: TicketId }>) {
  const { orgSlug, slug } = useProjectRoute()
  const req = commentsRequest(orgSlug, slug, ticketId)
  const result = useAtomValue(comments(req))
  useAtomMount(ticketActivity(ticketActivityRequest(orgSlug, slug, ticketId)))
  const project = useProject()
  const involved = useTicketParticipants(ticketId)
  const canComment = useProjectActor().call("ticketComments", "create")
  const [order, setOrder] = useActivityOrder()

  const rows = Result.isSuccess(result) ? result.value : []

  const orderLabel =
    order === "asc"
      ? m.tickets_activity_order_oldest()
      : m.tickets_activity_order_newest()
  const OrderIcon = order === "asc" ? ArrowUpNarrowWide : ArrowDownWideNarrow

  return (
    <MentionScopeProvider
      scope={{ orgSlug, slug, members: project.members, involved }}
    >
      <section className="flex flex-col gap-3 [--fs-body:13px] [--lh-body:20px] [--text-body--line-height:20px] [--text-body:13px]">
        <div className="flex items-center gap-1 pl-(--ticket-box-offset)">
          <h2 className="text-[15px]/5 text-foreground">
            {m.tickets_activity_tab()}
          </h2>
          <Button
            type="button"
            variant="quiet"
            size="square-7"
            onClick={() => setOrder(order === "asc" ? "desc" : "asc")}
            aria-label={orderLabel}
            title={orderLabel}
          >
            <OrderIcon className="size-4" strokeWidth={1.75} />
          </Button>
          <SubscribeToggle ticketId={ticketId} className="mr-2 ml-auto" />
        </div>
        <div className="flex flex-col gap-4">
          <TicketTimeline
            ticketId={ticketId}
            order={order}
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
          {canComment && (
            <div className={order === "desc" ? "order-first" : undefined}>
              <CommentComposer ticketId={ticketId} />
            </div>
          )}
        </div>
      </section>
    </MentionScopeProvider>
  )
}
