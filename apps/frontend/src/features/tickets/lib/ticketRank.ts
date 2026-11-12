import { TicketRank, type TicketPosition } from "@pp/shared"
import { generateKeyBetween } from "fractional-indexing"

import { compareCodePoints } from "@/lib/orderKey"

type Ranked = Readonly<{ id: string; rank: TicketRank }>

export const compareByRank = (a: Ranked, b: Ranked): number =>
  compareCodePoints(a.rank, b.rank) || compareCodePoints(a.id, b.id)

export const predictRank = (
  ranked: ReadonlyArray<Ranked>,
  movingId: string,
  position: TicketPosition
): TicketRank | null => {
  const others = ranked.filter((ticket) => ticket.id !== movingId)
  const anchorId = "after" in position ? position.after : position.before
  const index = others.findIndex((ticket) => ticket.id === anchorId)
  if (index < 0) return null
  const [lower, upper] =
    "after" in position
      ? [others[index].rank, others[index + 1]?.rank ?? null]
      : [others[index - 1]?.rank ?? null, others[index].rank]
  try {
    return TicketRank.make(generateKeyBetween(lower, upper))
  } catch {
    return null
  }
}
