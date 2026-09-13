import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { commentsAtom, commentsKey } from "@/atoms/comments"
import {
  projectKey,
  sprintMembershipAtom,
  sprintsListAtom,
  sprintsListBaseAtom
} from "@/atoms/sprints"
import { TicketPageHeader } from "@/components/TicketPage/TicketPageHeader"
import { TicketPageShell } from "@/components/TicketPage/TicketPageShell"
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
  const commentsResult = useAtomValue(
    commentsAtom(commentsKey(orgSlug, slug, ticket.id))
  )
  const commentCount = Result.isSuccess(commentsResult)
    ? commentsResult.value.length
    : 0
  const pKey = projectKey(orgSlug, slug)
  const sprintsResult = useAtomValue(sprintsListAtom(pKey))
  const sprintMembership = useAtomValue(sprintMembershipAtom(pKey))
  const refreshSprints = useAtomRefresh(sprintsListBaseAtom(pKey))
  const sprintsSettled = !Result.isInitial(sprintsResult)
  const sprintId = sprintMembership.get(ticket.id)?.id ?? null

  const returnToOrigin = (created: ReadonlyArray<TicketId>) => {
    if (created.length > 0) refreshSprints()
    if (canGoBack) {
      router.history.back()
      return
    }
    void navigate({
      to: "/orgs/$orgSlug/projects/$slug/tickets/$id",
      params: { orgSlug, slug, id: ticket.id },
      search: created.length > 0 ? { splitInto: [...created] } : {}
    })
  }

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
      {sprintsSettled && (
        <TicketSplitForm
          orgSlug={orgSlug}
          slug={slug}
          ticket={ticket}
          members={members}
          commentCount={commentCount}
          sprintId={sprintId}
          onSplit={returnToOrigin}
          onCancel={() => returnToOrigin([])}
        />
      )}
    </TicketPageShell>
  )
}
