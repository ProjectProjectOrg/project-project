import { useAtomValue } from "@effect/atom-react"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { useMemo } from "react"

import {
  type MentionedTicket,
  mentionedTickets,
  type TicketLocation
} from "./atoms"
import { mentionedTicketIds } from "./ticketBody"

const noMentions: ReadonlyMap<string, MentionedTicket> = new Map()

export const useMentionedTickets = (
  from: TicketLocation,
  body: string | null
) => {
  const ids = useMemo(
    () => (body === null ? [] : mentionedTicketIds(body)),
    [body]
  )
  const result = useAtomValue(mentionedTickets({ from, ids }))
  return AsyncResult.getOrElse(result, () => noMentions)
}
