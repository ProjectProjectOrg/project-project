import { useNavigate, useRouter } from "@tanstack/react-router"
import {
  ticketListQueryToSearch,
  type TicketListQuery
} from "@projectproject/shared"

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

export const TICKET_SEARCH_KEYS = [
  "status",
  "type",
  "assignee",
  "tags",
  "groupId",
  "hasBranch",
  "hasPr",
  "archived",
  "sort",
  "q",
  "cursor"
] as const

const clearedTicketSearch = Object.fromEntries(
  TICKET_SEARCH_KEYS.map((key) => [key, undefined])
)

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
    const nextSearch = ticketListQueryToSearch({ ...query, cursor: undefined })
    void navigate({
      to: router.state.location.pathname,
      search: (prev) => ({ ...prev, ...clearedTicketSearch, ...nextSearch }),
      replace: true,
      resetScroll: false
    })
  }
}
