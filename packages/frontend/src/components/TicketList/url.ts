import { useNavigate, useRouter } from "@tanstack/react-router"

export const TICKET_SEARCH_KEYS = [
  "status",
  "type",
  "assignee",
  "tags",
  "groupId",
  "hasBranch",
  "hasPr",
  "sort",
  "q",
  "cursor"
] as const

export function useResetTicketSearch() {
  const router = useRouter()
  const navigate = useNavigate()
  return () => {
    void navigate({
      to: router.state.location.pathname,
      search: (prev: Record<string, unknown>) => {
        const cleared: Record<string, unknown> = { ...prev }
        for (const k of TICKET_SEARCH_KEYS) cleared[k] = undefined
        return cleared
      },
      replace: true
    })
  }
}
