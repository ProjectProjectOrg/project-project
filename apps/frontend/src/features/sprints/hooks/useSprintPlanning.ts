import { useAtomValue } from "@effect/atom-react"
import {
  pickActiveSprint,
  statusPhaseLookup,
  type Group,
  type GroupId,
  type StatusPhaseOf,
  type Ticket
} from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"

import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  boardRequest,
  sprintBoard,
  type BoardValue
} from "@/features/sprints/atoms/sprintBoard"
import {
  sprintList,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import { nowDate } from "@/features/sprints/lib/sprintDates"
import { sprintOverview } from "@/features/sprints/lib/sprintOverview"
import {
  averageDone,
  type PlanMeasure
} from "@/features/sprints/lib/sprintPlan"

type BoardAtom = Atom.Atom<Result.AsyncResult<BoardValue, unknown>>
const NO_BOARD: BoardAtom = Atom.make(
  Result.success({ tickets: [], completedAt: null })
)

export function useSprintTickets(id: GroupId | undefined) {
  const { orgSlug, slug } = useProjectRoute()
  const atom: BoardAtom =
    id === undefined ? NO_BOARD : sprintBoard(boardRequest(orgSlug, slug, id))
  const result = useAtomValue(atom)
  return Result.isSuccess(result) ? result.value.tickets : null
}

export type SprintPlanning = Readonly<{
  capacity: number | null
  basis: number
  history: ReadonlyArray<ReadonlyArray<Ticket>>
  phaseOf: StatusPhaseOf | null
  active: Readonly<{ sprint: Group; tickets: ReadonlyArray<Ticket> }> | null
}>

export function useSprintPlanning(measure: PlanMeasure) {
  const { orgSlug, slug } = useProjectRoute()
  const list = useAtomValue(sprintList(sprintListRequest(orgSlug, slug)))
  const overview = Result.isSuccess(list)
    ? sprintOverview(list.value, nowDate())
    : null
  const completed = overview?.completed.slice(0, 3) ?? []
  const activeSprint = Result.isSuccess(list)
    ? (pickActiveSprint(list.value) ?? undefined)
    : undefined
  const loaded = [
    useSprintTickets(completed[0]?.id),
    useSprintTickets(completed[1]?.id),
    useSprintTickets(completed[2]?.id)
  ].slice(0, completed.length)
  const activeTickets = useSprintTickets(activeSprint?.id)
  const statuses = useAtomValue(statusesFor(statusesRequest(orgSlug, slug)))
  const phaseOf = Result.isSuccess(statuses)
    ? statusPhaseLookup(statuses.value)
    : null
  const history = loaded.every((tickets) => tickets !== null)
    ? loaded.flatMap((tickets) => (tickets === null ? [] : [tickets]))
    : []
  return {
    capacity:
      phaseOf !== null && history.length === completed.length
        ? averageDone(history, measure, phaseOf)
        : null,
    basis: completed.length,
    history,
    phaseOf,
    active:
      activeSprint && activeTickets
        ? { sprint: activeSprint, tickets: activeTickets }
        : null
  }
}
