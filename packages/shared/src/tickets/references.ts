import * as Exit from "effect/Exit"
import * as Schema from "effect/Schema"

import { TicketId } from "./Ticket"

const ticketIdPattern =
  /(?:^|[^\p{L}\p{N}])([A-Za-z][A-Za-z0-9]*-[0-9]+)(?=$|[^\p{L}\p{N}])/gu

const closingTicketIdPattern =
  /(?:^|[^\p{L}\p{N}])(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+(?:ticket\s+)?([A-Za-z][A-Za-z0-9]*-[0-9]+)(?=$|[^\p{L}\p{N}])/giu

const decodeTicketId = Schema.decodeUnknownExit(TicketId)

const ticketIdsMatching = (pattern: RegExp, text: string) => {
  const ids = new Set<TicketId>()
  for (const match of text.matchAll(pattern)) {
    const token = match[1]
    if (token === undefined) continue
    const decoded = decodeTicketId(token.toUpperCase())
    if (Exit.isSuccess(decoded)) ids.add(decoded.value)
  }
  return ids
}

export const ticketIdsInText = (text: string) =>
  ticketIdsMatching(ticketIdPattern, text)

export const closingTicketIdsInText = (text: string) =>
  ticketIdsMatching(closingTicketIdPattern, text)

export const branchMentionsTicketId = (branch: string) =>
  ticketIdsInText(branch).size > 0

export type ProjectKeys = Readonly<{
  current: string
  former: ReadonlyArray<string>
}>

export const resolveTicketId = (keys: ProjectKeys, id: TicketId) => {
  const dash = id.lastIndexOf("-")
  if (!keys.former.includes(id.slice(0, dash))) return id
  const resolved = decodeTicketId(`${keys.current}${id.slice(dash)}`)
  return Exit.isSuccess(resolved) ? resolved.value : id
}
