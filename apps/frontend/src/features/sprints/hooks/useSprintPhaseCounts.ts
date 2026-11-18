import { useAtomValue } from "@effect/atom-react"
import { statusPhaseLookup, type GroupId } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"

import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { countPhases } from "@/features/sprints/lib/sprintOverview"

import { useSprintTickets } from "./useSprintPlanning"

export function useSprintPhaseCounts(id: GroupId) {
  const { orgSlug, slug } = useProjectRoute()
  const tickets = useSprintTickets(id)
  const statuses = useAtomValue(statusesFor(statusesRequest(orgSlug, slug)))
  return tickets !== null && Result.isSuccess(statuses)
    ? countPhases(tickets, statusPhaseLookup(statuses.value))
    : null
}
