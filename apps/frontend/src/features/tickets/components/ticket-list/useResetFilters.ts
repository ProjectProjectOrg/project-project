import { useNavigate, useRouter } from "@tanstack/react-router"

export function useResetFilters(): () => void {
  const router = useRouter()
  const navigate = useNavigate()
  return () => {
    void navigate({
      to: router.state.location.pathname,
      search: (previous) => ({
        rule: undefined,
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
        dir: undefined,
        q: undefined,
        cursor: undefined,
        view: previous.view
      }),
      replace: true,
      resetScroll: false
    })
  }
}
