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

type SearchValue = string | ReadonlyArray<string> | undefined
type SearchRecord = { readonly [k: string]: SearchValue }

export function useResetTicketSearch() {
  const router = useRouter()
  const navigate = useNavigate()
  return () => {
    void navigate({
      to: router.state.location.pathname,
      search: (prev: SearchRecord): SearchRecord => {
        const cleared: { [k: string]: SearchValue } = { ...prev }
        for (const k of TICKET_SEARCH_KEYS) cleared[k] = undefined
        return cleared
      },
      replace: true
    })
  }
}
