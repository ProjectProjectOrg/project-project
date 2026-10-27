import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { TicketType, type TicketListQuery } from "@pp/shared"
import { useNavigate } from "@tanstack/react-router"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  backlogRequest,
  quickCreateBacklogTicket
} from "@/features/tickets/atoms/backlog"

import { TicketComposer } from "./TicketComposer"

export function BacklogTicketCreator({ query }: { query: TicketListQuery }) {
  const { orgSlug, slug } = useProjectRoute()
  const req = backlogRequest(orgSlug, slug, query)
  const create = useAtomSet(quickCreateBacklogTicket(req), {
    mode: "promiseExit"
  })
  const createState = useAtomValue(quickCreateBacklogTicket(req))
  const navigate = useNavigate()

  return (
    <TicketComposer
      types={TicketType.literals}
      create={create}
      createState={createState}
      onCreated={(ticket) =>
        void navigate({
          to: "/orgs/$orgSlug/projects/$slug/tickets/$id",
          params: { orgSlug, slug, id: ticket.id },
          search: { focusBody: 1 }
        })
      }
    />
  )
}
