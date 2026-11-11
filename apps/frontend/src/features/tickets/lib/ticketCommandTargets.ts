import type { TicketTextHit } from "@pp/shared"

import type { CommandFrameItem } from "@/features/command-menu/components/CommandFrame"

export type TicketTarget = Readonly<{
  id: string
  title: string
  projectSlug: string
  match?: TicketTextHit["match"]
  score?: number
}>

export const ticketCommandValue = (
  target: Pick<TicketTarget, "projectSlug" | "id">
): string => `open-ticket:${target.projectSlug}/${target.id}`

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
  options: Readonly<{ inSearch?: boolean }> = {}
): CommandFrameItem => ({
  value: ticketCommandValue(target),
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
