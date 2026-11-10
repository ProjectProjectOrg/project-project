import { useAtomValue } from "@effect/atom-react"
import type { TicketTextHit } from "@pp/shared"
import { useDebouncedValue } from "@tanstack/react-pacer"
import * as Result from "effect/reactivity/AsyncResult"
import { useState } from "react"

import type { CommandFrameItem } from "@/features/command-menu/components/CommandFrame"
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

export type TicketTarget = Readonly<{
  id: string
  title: string
  projectSlug: string
  match?: TicketTextHit["match"]
  score?: number
}>

type ShownText = Readonly<{
  query: string
  hits: ReadonlyArray<TicketTextHit>
}>

const NO_TEXT: ShownText = { query: "", hits: [] }

const RECENT_LIMIT = 6
const PROJECT_BONUS = 20
const TITLE_LIMIT = 20
const TEXT_SEARCH_MIN = 3
const SEARCHING_DELAY_MS = 120
const TEXT_SEARCH_WAIT_MS = 150

const matchDetail = (
  match: TicketTextHit["match"] | undefined
): CommandFrameItem["detail"] => {
  if (match === undefined || match.where === "title") return undefined
  return {
    author: match.where === "comment" ? match.author : undefined,
    text: match.snippet.text,
    ranges: match.snippet.ranges
  }
}

const TITLE_RANK = 55
const DESCRIPTION_RANK = 32
const COMMENT_RANK = 28

export const SEARCHING_RANK = DESCRIPTION_RANK

const matchRank = (match: TicketTextHit["match"] | undefined) =>
  match === undefined || match.where === "title"
    ? TITLE_RANK
    : match.where === "description"
      ? DESCRIPTION_RANK
      : COMMENT_RANK

export const ticketItem = (
  target: TicketTarget,
  group: string,
  options: Readonly<{ valuePrefix?: string; inSearch?: boolean }> = {}
): CommandFrameItem => ({
  value: `${options.valuePrefix ?? ""}${target.id}`,
  prefix: target.id,
  label: target.title,
  detail: matchDetail(target.match),
  rank:
    options.inSearch === true
      ? (target.score ?? matchRank(target.match))
      : undefined,
  actionable: options.inSearch,
  peekable: options.inSearch,
  group,
  searchOnly: options.inSearch,
  prefiltered: options.inSearch
})

export type TicketCommandSearch = Readonly<{
  recent: ReadonlyArray<TicketTarget>
  found: ReadonlyArray<TicketTarget>
  searching: boolean
}>

function useDelayedFlag(on: boolean, wait: number): boolean {
  const [settled] = useDebouncedValue(on, { wait })
  return on && settled
}

const titleScore = (
  ticket: Readonly<{ id: string; title: string }>,
  query: string,
  inProject: boolean
): number | null => {
  const score = scoreSearch({ label: ticket.title, prefix: ticket.id }, query)
  return score === null ? null : score + (inProject ? PROJECT_BONUS : 0)
}

const titleMatches = (
  titles: ReadonlyArray<Readonly<{ id: string; title: string }>>,
  query: string,
  projectSlug: string
): ReadonlyArray<TicketTarget> =>
  titles
    .flatMap((ticket): ReadonlyArray<TicketTarget> => {
      const score = titleScore(ticket, query, true)
      return score === null
        ? []
        : [{ id: ticket.id, title: ticket.title, projectSlug, score }]
    })
    .toSorted((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, TITLE_LIMIT)

export function useTicketCommandSearch(
  { orgSlug, projectSlug }: CommandContext,
  search: string
): TicketCommandSearch {
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
  const searching = useDelayedFlag(
    textQuery && !current && !held,
    SEARCHING_DELAY_MS
  )
  if (query === "") return { recent: [], found: [], searching: false }

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
              projectSlug: row.project.slug,
              score
            }
          ]
    })
    .slice(0, RECENT_LIMIT)
  if (projectSlug === null) return { recent, found: [], searching: false }

  const titles = titleMatches(
    Result.isSuccess(titlesResult) ? titlesResult.value : [],
    query,
    projectSlug
  )
  const text = textHits.map(
    (hit): TicketTarget => ({
      id: hit.id,
      title: hit.title,
      projectSlug,
      match: hit.match
    })
  )
  const seen = new Set<string>(recent.map((target) => target.id))
  const found = [...titles, ...text].filter((target) => {
    if (seen.has(target.id)) return false
    seen.add(target.id)
    return true
  })
  return { recent, found, searching }
}
