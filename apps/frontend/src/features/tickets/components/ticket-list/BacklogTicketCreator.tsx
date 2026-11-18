import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { TicketListQuery } from "@pp/shared"

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

  return <TicketComposer epics create={create} createState={createState} />
}
