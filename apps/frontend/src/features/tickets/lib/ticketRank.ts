import { TicketRank, type TicketPosition } from "@pp/shared"
import { generateNKeysBetween } from "fractional-indexing"

import { compareCodePoints } from "@/lib/orderKey"

type Ranked = Readonly<{ id: string; rank: TicketRank }>

export const compareByRank = (a: Ranked, b: Ranked): number =>
  compareCodePoints(a.rank, b.rank) || compareCodePoints(a.id, b.id)

export const predictRanks = (
  ranked: ReadonlyArray<Ranked>,
  movingIds: ReadonlyArray<string>,
  position: TicketPosition
): ReadonlyArray<TicketRank> | null => {
  const others = ranked.filter((ticket) => !movingIds.includes(ticket.id))
  const anchorId = "after" in position ? position.after : position.before
  const index = others.findIndex((ticket) => ticket.id === anchorId)
  if (index < 0) return null
  const [lower, upper] =
    "after" in position
      ? [others[index].rank, others[index + 1]?.rank ?? null]
      : [others[index - 1]?.rank ?? null, others[index].rank]
  try {
    return generateNKeysBetween(lower, upper, movingIds.length).map((key) =>
      TicketRank.make(key)
    )
  } catch {
    return null
  }
}

export const predictRank = (
  ranked: ReadonlyArray<Ranked>,
  movingId: string,
  position: TicketPosition
): TicketRank | null => predictRanks(ranked, [movingId], position)?.[0] ?? null
