import { useNavigate, useRouter } from "@tanstack/react-router"
import * as Schema from "effect/Schema"
import {
  TicketListQuery as TicketListQuerySchema,
  type TicketListQuery
} from "@projectproject/shared"

const encodeTicketListQuery = Schema.encodeSync(TicketListQuerySchema)

export function queryHasActiveFilter(q: TicketListQuery): boolean {
  if (q.q !== undefined && q.q.length > 0) return true
  return (
    (q.status?.length ?? 0) > 0 ||
    (q.type?.length ?? 0) > 0 ||
    (q.assignee?.length ?? 0) > 0 ||
    (q.tags?.length ?? 0) > 0 ||
    (q.groupId?.length ?? 0) > 0 ||
    q.hasBranch !== undefined ||
    q.hasPr !== undefined ||
    q.updatedAfter !== undefined ||
    q.archived !== undefined
  )
}

const clearedTicketSearch = {
  status: undefined,
  type: undefined,
  assignee: undefined,
  tags: undefined,
  groupId: undefined,
  hasBranch: undefined,
  hasPr: undefined,
  updatedAfter: undefined,
  archived: undefined,
  sort: undefined,
  q: undefined,
  cursor: undefined
}

export function useResetTicketSearch() {
  const router = useRouter()
  const navigate = useNavigate()
  return () => {
    void navigate({
      to: router.state.location.pathname,
      search: (prev) => ({ ...prev, ...clearedTicketSearch }),
      replace: true
    })
  }
}

export function useUpdateTicketQuery() {
  const router = useRouter()
  const navigate = useNavigate()
  return (query: TicketListQuery) => {
    const nextSearch = encodeTicketListQuery({ ...query, cursor: undefined })
    void navigate({
      to: router.state.location.pathname,
      search: (prev) => ({ ...prev, ...clearedTicketSearch, ...nextSearch }),
      replace: true,
      resetScroll: false
    })
  }
}
