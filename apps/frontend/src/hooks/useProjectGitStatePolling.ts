import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { GitStatesResponse } from "@pp/shared"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { useEffect, useMemo, useRef } from "react"

import {
  invalidateGitStateTickets,
  projectGitStates,
  projectGitStatesWaiting
} from "@/features/github/atoms/github"
import { projectRequest } from "@/features/projects/atoms/projects"
import {
  changedGitStateTicketIds,
  shouldInvalidateTicketsForGitStates
} from "@/lib/gitStateChanges"

const POLL_INTERVAL_MS = 60_000

export function useProjectGitStatePolling(
  orgSlug: string,
  slug: string,
  enabled: boolean
) {
  const req = useMemo(() => projectRequest(orgSlug, slug), [orgSlug, slug])
  const states = useAtomValue(projectGitStates(req))
  const refresh = useAtomRefresh(projectGitStates(req))
  const invalidateTickets = useAtomSet(invalidateGitStateTickets(req))
  const reading = useAtomValue(projectGitStatesWaiting(req))
  const waiting = useRef(reading)
  const seen = useRef<GitStatesResponse | undefined>(undefined)
  waiting.current = reading

  useEffect(() => {
    if (!enabled || !AsyncResult.isSuccess(states) || states.waiting) return
    const previous = seen.current
    if (previous === states.value) return
    seen.current = states.value
    if (
      shouldInvalidateTicketsForGitStates(states.value) ||
      changedGitStateTicketIds(previous, states.value).length > 0
    ) {
      invalidateTickets()
    }
  }, [enabled, states, invalidateTickets])

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return

    let scheduled: number | undefined
    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible" || scheduled !== undefined)
        return
      scheduled = window.setTimeout(() => {
        scheduled = undefined
        if (document.visibilityState === "visible" && !waiting.current) {
          refresh()
        }
      }, 50)
    }

    const interval = window.setInterval(refreshIfVisible, POLL_INTERVAL_MS)
    document.addEventListener("visibilitychange", refreshIfVisible)
    window.addEventListener("focus", refreshIfVisible)

    return () => {
      window.clearInterval(interval)
      window.clearTimeout(scheduled)
      document.removeEventListener("visibilitychange", refreshIfVisible)
      window.removeEventListener("focus", refreshIfVisible)
    }
  }, [enabled, refresh])
}
