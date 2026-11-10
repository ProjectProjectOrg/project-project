import { useAtomValue } from "@effect/atom-react"
import type { TicketId } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import { TicketPreviewTrigger } from "@/features/tickets/components/ticket-preview/TicketPreview"

import { EpicLink, EpicSeparator, useParentLabel } from "./EpicLabel"

export function ParentPrefix({ parentId }: Readonly<{ parentId: TicketId }>) {
  const { orgSlug, slug } = useProjectRoute()
  const ref = { orgSlug, slug, epicId: parentId }
  const label = useParentLabel(ref)
  if (label === null) return null
  return (
    <>
      {label.epic ? (
        <TicketPreviewTrigger
          preview={{ kind: "ticket", id: parentId }}
          render={<span className="flex min-w-0 shrink-0" />}
        >
          <EpicLink {...ref} className="text-body" />
        </TicketPreviewTrigger>
      ) : (
        <ParentTicketLink parentId={parentId} />
      )}
      <EpicSeparator className="shrink-0 text-body" />
    </>
  )
}

function ParentTicketLink({ parentId }: Readonly<{ parentId: TicketId }>) {
  const { orgSlug, slug } = useProjectRoute()
  const parent = useAtomValue(
    ticketDetail(ticketRequest(orgSlug, slug, parentId))
  )
  return (
    <TicketPreviewTrigger
      preview={{ kind: "ticket", id: parentId }}
      render={
        <Link
          to="/orgs/$orgSlug/projects/$slug/tickets/$id"
          params={{ orgSlug, slug, id: parentId }}
          preload="intent"
          className="max-w-[24ch] shrink-0 truncate text-body text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        />
      }
    >
      {Result.isSuccess(parent) ? parent.value.title : parentId}
    </TicketPreviewTrigger>
  )
}
