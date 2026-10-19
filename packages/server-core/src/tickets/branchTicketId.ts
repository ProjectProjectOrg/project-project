import { TicketId } from "@pp/shared"
import * as Exit from "effect/Exit"
import * as Schema from "effect/Schema"

const ticketIdPattern =
  /(?:^|[^\p{L}\p{N}])([A-Za-z][A-Za-z0-9]*-[0-9]+)(?=$|[^\p{L}\p{N}])/gu

const closingTicketIdPattern =
  /(?:^|[^\p{L}\p{N}])(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+(?:ticket\s+)?([A-Za-z][A-Za-z0-9]*-[0-9]+)(?=$|[^\p{L}\p{N}])/giu

const decodeTicketId = Schema.decodeUnknownExit(TicketId)

const ticketIdsMatching = (
  pattern: RegExp,
  text: string
): ReadonlySet<TicketId> => {
  const ids = new Set<TicketId>()
  for (const match of text.matchAll(pattern)) {
    const token = match[1]
    if (token === undefined) continue
    const decoded = decodeTicketId(token.toUpperCase())
    if (Exit.isSuccess(decoded)) ids.add(decoded.value)
  }
  return ids
}

export const ticketIdsInText = (text: string): ReadonlySet<TicketId> =>
  ticketIdsMatching(ticketIdPattern, text)

export const ticketIdsInBranch = ticketIdsInText

/** Ticket ids after a GitHub closing keyword, as in "Fixes T-12" or "Resolves ticket T-12". */
export const closingTicketIdsInText = (text: string): ReadonlySet<TicketId> =>
  ticketIdsMatching(closingTicketIdPattern, text)

export const branchMentionsTicketId = (branch: string): boolean =>
  ticketIdsInBranch(branch).size > 0
