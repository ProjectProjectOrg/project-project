import { RegistryContext, useAtomSet } from "@effect/atom-react"
import type { TicketDetail, TicketStatus } from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { useContext } from "react"

import { fireMutation } from "@/api/viewMutation"
import { branchAttempt, createBranch } from "@/features/github/atoms/github"
import { projectRequest } from "@/features/projects/atoms/projects"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  ticketRequest,
  updateTicketDetail
} from "@/features/tickets/atoms/ticketDetail"

export type CreateBranchInput = Readonly<{
  name: string
  base: string
  status: TicketStatus
}>

export function useCreateBranch(ticket: TicketDetail) {
  const { orgSlug, slug } = useProjectRoute()
  const registry = useContext(RegistryContext)
  const setAttempt = useAtomSet(branchAttempt(ticket.id))
  return async ({ name, base, status }: CreateBranchInput) => {
    setAttempt({ action: "create", name })
    const result = await fireMutation(
      registry,
      createBranch({ req: projectRequest(orgSlug, slug), id: ticket.id }),
      { name, baseBranch: base }
    )
    if (AsyncResult.isSuccess(result) && status !== ticket.status) {
      registry.set(
        updateTicketDetail(ticketRequest(orgSlug, slug, ticket.id)),
        { status }
      )
    }
  }
}
