import { useAtomValue } from "@effect/atom-react"
import type { GitState, StackLayerState, Ticket } from "@pp/shared"
import * as Option from "effect/Option"
import * as Result from "effect/reactivity/AsyncResult"

import { projectGitStates } from "@/features/github/atoms/github"
import { projectRequest } from "@/features/projects/atoms/projects"

export type TicketGit = Readonly<{
  state: GitState | null
  stack: ReadonlyArray<StackLayerState>
  waiting: boolean
}>

export function useTicketGit(
  orgSlug: string,
  slug: string,
  ticket: Pick<Ticket, "id" | "gitState"> &
    Readonly<{ stack?: ReadonlyArray<StackLayerState> | undefined }>
): TicketGit {
  const states = useAtomValue(projectGitStates(projectRequest(orgSlug, slug)))
  const value = Option.getOrUndefined(Result.value(states))
  return {
    state: value?.states[ticket.id] ?? ticket.gitState,
    stack:
      value === undefined
        ? (ticket.stack ?? [])
        : (value.stacks?.[ticket.id] ?? []),
    waiting: states.waiting
  }
}
