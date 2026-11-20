import { useAtomValue } from "@effect/atom-react"
import type { TicketTextHit, TicketTitle } from "@pp/shared"
import { useDebouncedValue } from "@tanstack/react-pacer"
import * as Result from "effect/reactivity/AsyncResult"
import { useState } from "react"

import type { CommandContext } from "@/features/command-menu/lib/commands"
import { scoreSearch } from "@/features/command-menu/lib/searchScore"
import {
  recentTickets,
  recentTicketsRequest
} from "@/features/tickets/atoms/myTickets"
import {
  idleTicketTextSearch,
  idleTicketTitles,
  ticketTextSearch,
  ticketTitles
} from "@/features/tickets/atoms/ticketSearch"
import {
  ticketCommandValue,
  type TicketTarget
} from "@/features/tickets/lib/ticketCommandTargets"

type ShownText = Readonly<{
  query: string
  hits: ReadonlyArray<TicketTextHit>
}>

const NO_TEXT: ShownText = { query: "", hits: [] }

const RECENT_LIMIT = 6
const PROJECT_BONUS = 20
const TITLE_LIMIT = 20
const TEXT_SEARCH_MIN = 3
const TEXT_SEARCH_WAIT_MS = 150

export type TicketCommandSearch = Readonly<{
  recent: ReadonlyArray<TicketTarget>
  found: ReadonlyArray<TicketTarget>
}>

const titleScore = (
  ticket: Readonly<{ id: string; title: string }>,
  query: string,
  inProject: boolean
) => {
  const score = scoreSearch({ label: ticket.title, prefix: ticket.id }, query)
  return score === null ? null : score + (inProject ? PROJECT_BONUS : 0)
}

const titleMatches = (
  titles: ReadonlyArray<TicketTitle>,
  query: string,
  projectSlug: string
) =>
  titles
    .flatMap((ticket) => {
      const score = titleScore(ticket, query, true)
      return score === null
        ? []
        : [
            {
              id: ticket.id,
              title: ticket.title,
              status: ticket.status,
              type: ticket.type,
              projectSlug,
              score
            }
          ]
    })
    .toSorted((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, TITLE_LIMIT)

export function useTicketCommandSearch(
  { orgSlug, projectSlug }: CommandContext,
  search: string
) {
  const query = search.trim()
  const inProject = projectSlug !== null && query !== ""
  const textQuery = inProject && query.length >= TEXT_SEARCH_MIN
  const [debounced] = useDebouncedValue(query, { wait: TEXT_SEARCH_WAIT_MS })
  const textSearch = textQuery && debounced.length >= TEXT_SEARCH_MIN
  const titlesResult = useAtomValue(
    inProject ? ticketTitles({ orgSlug, slug: projectSlug }) : idleTicketTitles
  )
  const textResult = useAtomValue(
    textSearch
      ? ticketTextSearch({
          params: { orgSlug, slug: projectSlug },
          q: debounced
        })
      : idleTicketTextSearch
  )
  const recentResult = useAtomValue(
    recentTickets(recentTicketsRequest(orgSlug))
  )
  const [shownText, setShownText] = useState<ShownText>(NO_TEXT)
  if (
    textSearch &&
    Result.isSuccess(textResult) &&
    shownText.hits !== textResult.value
  ) {
    setShownText({ query: debounced, hits: textResult.value })
  }
  const current = textQuery && shownText.query === query
  const held =
    textQuery &&
    !current &&
    shownText.query !== "" &&
    (query.startsWith(shownText.query) || shownText.query.startsWith(query))
  const textHits = current || held ? shownText.hits : []
  if (query === "") return { recent: [], found: [] }

  const recent = (
    Result.isSuccess(recentResult) ? recentResult.value.tickets : []
  )
    .flatMap((row) => {
      if (projectSlug !== null && row.project.slug !== projectSlug) return []
      const score = titleScore(row.ticket, query, projectSlug !== null)
      return score === null
        ? []
        : [
            {
              id: row.ticket.id,
              title: row.ticket.title,
              status: row.ticket.status,
              type: row.ticket.type,
              projectSlug: row.project.slug,
              score
            }
          ]
    })
    .slice(0, RECENT_LIMIT)
  if (projectSlug === null) return { recent, found: [] }

  const titles = titleMatches(
    Result.isSuccess(titlesResult) ? titlesResult.value : [],
    query,
    projectSlug
  )
  const text = textHits.map((hit) => ({
    id: hit.id,
    title: hit.title,
    status: hit.status,
    type: hit.type,
    projectSlug,
    match: hit.match
  }))
  const seen = new Set<string>(recent.map(ticketCommandValue))
  const found = [...titles, ...text].filter((target) => {
    const value = ticketCommandValue(target)
    if (seen.has(value)) return false
    seen.add(value)
    return true
  })
  return { recent, found }
}
