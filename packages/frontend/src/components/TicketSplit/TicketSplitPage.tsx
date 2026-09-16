import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { useMemo } from "react"
import { comments, commentsRequest } from "@/atoms/comments"
import {
  sprintList,
  sprintListRequest,
  sprintMembership
} from "@/atoms/sprintList"
import { ErrorPage } from "@/components/ErrorPage"
import { TicketPageHeader } from "@/components/TicketPage/TicketPageHeader"
import { TicketPageShell } from "@/components/TicketPage/TicketPageShell"
import { DitherShell } from "@/components/ui/dither-shell"
import { TicketSplitForm } from "@/forms/ticket-split"
import { m } from "@/paraglide/messages"
import type { Member, TicketDetail, TicketId } from "@projectproject/shared"

export function TicketSplitPage({
  orgSlug,
  slug,
  ticket,
  members
}: {
  orgSlug: string
  slug: string
  ticket: TicketDetail
  members: ReadonlyArray<Member>
}) {
  const router = useRouter()
  const canGoBack = useCanGoBack()
  const navigate = useNavigate()
  const commentsReq = useMemo(
    () => commentsRequest(orgSlug, slug, ticket.id),
    [orgSlug, slug, ticket.id]
  )
  const sprintsReq = useMemo(
    () => sprintListRequest(orgSlug, slug),
    [orgSlug, slug]
  )
  const commentsResult = useAtomValue(comments(commentsReq))
  const sprintsResult = useAtomValue(sprintList(sprintsReq))
  const membershipResult = useAtomValue(sprintMembership(sprintsReq))
  const refreshSprints = useAtomRefresh(sprintList(sprintsReq))

  const returnToOrigin = (created: ReadonlyArray<TicketId>) => {
    if (created.length === 0 && canGoBack) {
      router.history.back()
      return
    }
    if (created.length > 0) refreshSprints()
    void navigate({
      to: "/orgs/$orgSlug/projects/$slug/tickets/$id",
      params: { orgSlug, slug, id: ticket.id },
      search: created.length > 0 ? { splitInto: [...created] } : {},
      replace: created.length > 0
    })
  }

  const content = Result.matchWithError(
    Result.all({
      comments: commentsResult,
      sprints: sprintsResult,
      membership: membershipResult
    }),
    {
      onInitial: () => (
        <DitherShell contained animated>
          {null}
        </DitherShell>
      ),
      onError: (error) => <ErrorPage contained error={error} />,
      onDefect: (defect) => <ErrorPage contained error={defect} />,
      onSuccess: ({ value }) => (
        <TicketSplitForm
          orgSlug={orgSlug}
          slug={slug}
          ticket={ticket}
          members={members}
          commentCount={value.comments.length}
          sprintId={value.membership.get(ticket.id)?.id ?? null}
          onSplit={returnToOrigin}
          onCancel={() => returnToOrigin([])}
        />
      )
    }
  )

  return (
    <TicketPageShell
      back={{
        to: "/orgs/$orgSlug/projects/$slug/tickets/$id",
        params: { orgSlug, slug, id: ticket.id }
      }}
      header={
        <TicketPageHeader
          orgSlug={orgSlug}
          slug={slug}
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
