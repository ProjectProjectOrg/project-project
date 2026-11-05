import { useAtomValue } from "@effect/atom-react"
import { useDebouncedValue } from "@tanstack/react-pacer"
import * as Result from "effect/reactivity/AsyncResult"
import { useState } from "react"

import {
  matches,
  type CommandFrameItem
} from "@/features/command-menu/components/CommandFrame"
import type { CommandContext } from "@/features/command-menu/lib/commands"
import {
  recentTickets,
  recentTicketsRequest
} from "@/features/tickets/atoms/myTickets"
import {
  idleTicketSearch,
  searchRequest,
  ticketSearch
} from "@/features/tickets/atoms/ticketSearch"

export type TicketTarget = Readonly<{
  id: string
  title: string
  projectSlug: string
}>

type Settled = Readonly<{
  source: unknown
  query: string
  targets: ReadonlyArray<TicketTarget>
}>

const EMPTY_SETTLED: Settled = { source: null, query: "", targets: [] }

const RECENT_LIMIT = 6

export const ticketItem = (
  target: TicketTarget,
  group: string,
  options: Readonly<{ valuePrefix?: string; inSearch?: boolean }> = {}
): CommandFrameItem => ({
  value: `${options.valuePrefix ?? ""}${target.id}`,
  prefix: target.id,
  label: target.title,
  group,
  searchOnly: options.inSearch,
  prefiltered: options.inSearch
})

export type TicketCommandSearch = Readonly<{
  recent: ReadonlyArray<TicketTarget>
  found: ReadonlyArray<TicketTarget>
}>

export function useTicketCommandSearch(
  { orgSlug, projectSlug }: CommandContext,
  search: string
): TicketCommandSearch {
  const query = search.trim()
  const [debounced] = useDebouncedValue(query, { wait: 150 })
  const searching = projectSlug !== null && query !== "" && debounced.length > 0
  const searchResult = useAtomValue(
    searching
      ? ticketSearch(
          searchRequest(orgSlug, projectSlug, { q: debounced, limit: 20 })
        )
      : idleTicketSearch
  )
  const [settled, setSettled] = useState<Settled>(EMPTY_SETTLED)
  if (
    searching &&
    Result.isSuccess(searchResult) &&
    settled.source !== searchResult.value
  ) {
    setSettled({
      source: searchResult.value,
      query: debounced,
      targets: searchResult.value.map((ticket) => ({
        id: ticket.id,
        title: ticket.title,
        projectSlug
      }))
    })
  }
  if (query === "" && settled !== EMPTY_SETTLED) setSettled(EMPTY_SETTLED)

  const recentResult = useAtomValue(
    recentTickets(recentTicketsRequest(orgSlug))
  )
  const shownQuery = projectSlug === null ? query : settled.query
  if (shownQuery === "") return { recent: [], found: [] }
  const recent = (
    Result.isSuccess(recentResult) ? recentResult.value.tickets : []
  ).flatMap((row) => {
    if (projectSlug !== null && row.project.slug !== projectSlug) return []
    const target = {
      id: row.ticket.id,
      title: row.ticket.title,
      projectSlug: row.project.slug
    }
    return matches(ticketItem(target, ""), shownQuery) ? [target] : []
  })
  const recentShown = recent.slice(0, RECENT_LIMIT)
  const recentIds = new Set<string>(recentShown.map((target) => target.id))
  return {
    recent: recentShown,
    found: settled.targets.filter((target) => !recentIds.has(target.id))
  }
}
