import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { TicketListQuery } from "@pp/shared"
import { useNavigate } from "@tanstack/react-router"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { backlogRequest } from "@/features/tickets/atoms/backlog"
import { quickCreateBacklogTicketOnServer } from "@/features/tickets/atoms/backlogCreate"

import { TicketComposer } from "./TicketComposer"

export function BacklogTicketCreator({ query }: { query: TicketListQuery }) {
  const { orgSlug, slug } = useProjectRoute()
  const req = backlogRequest(orgSlug, slug, query)
  const create = useAtomSet(quickCreateBacklogTicketOnServer(req), {
    mode: "promiseExit"
  })
  const createState = useAtomValue(quickCreateBacklogTicketOnServer(req))
  const navigate = useNavigate()

  return (
    <TicketComposer
      epics
      create={create}
      createState={createState}
      onCreated={(ticket) =>
        void navigate({
          to: "/orgs/$orgSlug/projects/$slug/tickets/$id",
          params: { orgSlug, slug, id: ticket.id },
          search: { focusBody: "1" }
        })
      }
    />
  )
}
