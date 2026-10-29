import { useAtomValue } from "@effect/atom-react"
import type { TicketId } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import { m } from "@/paraglide/messages"

import { EpicLink, EpicSeparator, useParentLabel } from "./EpicLabel"

export function ParentPrefix({
  parentId,
  showEpic
}: Readonly<{ parentId: TicketId; showEpic: boolean }>) {
  const { orgSlug, slug } = useProjectRoute()
  const ref = { orgSlug, slug, epicId: parentId }
  const label = useParentLabel(ref)
  if (label === null || (label.epic && !showEpic)) return null
  return (
    <>
      {label.epic ? (
        <EpicLink {...ref} className="text-sm" />
      ) : (
        <ParentTicketLink parentId={parentId} />
      )}
      <EpicSeparator className="shrink-0 text-sm" />
    </>
  )
}

function ParentTicketLink({ parentId }: Readonly<{ parentId: TicketId }>) {
  const { orgSlug, slug } = useProjectRoute()
  const parent = useAtomValue(
    ticketDetail(ticketRequest(orgSlug, slug, parentId))
  )
  return (
    <Link
      to="/orgs/$orgSlug/projects/$slug/tickets/$id"
      params={{ orgSlug, slug, id: parentId }}
      preload="intent"
      title={m.tickets_sub_ticket_of_marker({ id: parentId })}
      className="max-w-[24ch] shrink-0 truncate text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
    >
      {Result.isSuccess(parent) ? parent.value.title : parentId}
    </Link>
  )
}
