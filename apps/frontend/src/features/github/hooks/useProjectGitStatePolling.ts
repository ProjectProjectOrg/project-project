import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { GitStatesResponse } from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { useEffect, useRef } from "react"

import {
  invalidateGitStateTickets,
  projectGitStates,
  projectGitStatesWaiting
} from "@/features/github/atoms/github"
import {
  changedGitStateTicketIds,
  shouldInvalidateTicketsForGitStates
} from "@/features/github/lib/gitStateChanges"
import { projectRequest } from "@/features/projects/atoms/projects"
import { useVisibleInterval } from "@/hooks/useVisibleInterval"

const POLL_INTERVAL_MS = 60_000

export function useProjectGitStatePolling(
  orgSlug: string,
  slug: string,
  enabled: boolean
) {
  const req = projectRequest(orgSlug, slug)
  const states = useAtomValue(projectGitStates(req))
  const refresh = useAtomRefresh(projectGitStates(req))
  const invalidateTickets = useAtomSet(invalidateGitStateTickets(req))
  const reading = useAtomValue(projectGitStatesWaiting(req))
  const waiting = useRef(reading)
  const seen = useRef<GitStatesResponse | undefined>(undefined)
  const scheduled = useRef<number | undefined>(undefined)
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
    if (!enabled) return undefined
    return () => {
      window.clearTimeout(scheduled.current)
      scheduled.current = undefined
    }
  }, [enabled])

  useVisibleInterval(
    () => {
      if (scheduled.current !== undefined) return
      scheduled.current = window.setTimeout(() => {
        scheduled.current = undefined
        if (document.visibilityState === "visible" && !waiting.current) {
          refresh()
        }
      }, 50)
    },
    POLL_INTERVAL_MS,
    enabled
  )
}
