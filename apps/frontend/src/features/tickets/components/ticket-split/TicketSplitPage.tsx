import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { Member, TicketDetail, TicketId } from "@pp/shared"
import { useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"

import { AsyncView } from "@/components/shell/AsyncView"
import { DitherShell } from "@/components/ui/dither-shell"
import { comments, commentsRequest } from "@/features/comments/atoms/comments"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  sprintList,
  sprintListRequest,
  sprintMembership
} from "@/features/sprints/atoms/sprintList"
import { TicketPageHeader } from "@/features/tickets/components/ticket-page/TicketPageHeader"
import { TicketPageShell } from "@/features/tickets/components/ticket-page/TicketPageShell"
import { TicketSplitForm } from "@/features/tickets/forms/ticket-split"
import { m } from "@/paraglide/messages"

export function TicketSplitPage({
  ticket,
  members,
  openedFromList = false
}: {
  ticket: TicketDetail
  members: ReadonlyArray<Member>
  openedFromList?: boolean
}) {
  const { orgSlug, slug } = useProjectRoute()
  const router = useRouter()
  const canGoBack = useCanGoBack()
  const navigate = useNavigate()
  const commentsReq = commentsRequest(orgSlug, slug, ticket.id)
  const sprintsReq = sprintListRequest(orgSlug, slug)
  const commentsResult = useAtomValue(comments(commentsReq))
  const sprintsResult = useAtomValue(sprintList(sprintsReq))
  const membershipResult = useAtomValue(sprintMembership(sprintsReq))
  const refreshSprints = useAtomRefresh(sprintList(sprintsReq))

  const returnToOrigin = (created: ReadonlyArray<TicketId>) => {
    if (created.length > 0) refreshSprints()
    if (canGoBack && (created.length === 0 || openedFromList)) {
      router.history.back()
      return
    }
    void navigate({
      to: "/orgs/$orgSlug/projects/$slug/tickets/$id",
      params: { orgSlug, slug, id: ticket.id },
      search: created.length > 0 ? { splitInto: [...created] } : {},
      replace: created.length > 0
    })
  }

  const content = (
    <AsyncView
      result={Result.all({
        comments: commentsResult,
        sprints: sprintsResult,
        membership: membershipResult
      })}
      contained
      onInitial={() => (
        <DitherShell contained animated>
          {null}
        </DitherShell>
      )}
      onSuccess={({ value }) => (
        <TicketSplitForm
          ticket={ticket}
          members={members}
          commentCount={value.comments.length}
          sprintId={value.membership.get(ticket.id)?.id ?? null}
          onSplit={returnToOrigin}
          onCancel={() => returnToOrigin([])}
        />
      )}
    />
  )

  return (
    <TicketPageShell
      back={{
        to: "/orgs/$orgSlug/projects/$slug/tickets/$id",
        params: { orgSlug, slug, id: ticket.id }
      }}
      header={
        <TicketPageHeader
          ticket={ticket}
          readOnly
          meta={
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {m.tickets_split_eyebrow()}
            </span>
          }
        />
      }
    >
      {content}
    </TicketPageShell>
  )
}
