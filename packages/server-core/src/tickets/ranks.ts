import { TicketRank } from "@pp/shared"
import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing"

import type { TicketRankGap } from "./TicketIndex"

export const rankBetween = (gap: TicketRankGap): TicketRank =>
  TicketRank.make(generateKeyBetween(gap.lower, gap.upper))

export const ranksBetween = (
  gap: TicketRankGap,
  count: number
): ReadonlyArray<TicketRank> =>
  generateNKeysBetween(gap.lower, gap.upper, count).map((key) =>
    TicketRank.make(key)
  )

export const compareByRank = (
  a: Readonly<{ rank: TicketRank; id: string }>,
  b: Readonly<{ rank: TicketRank; id: string }>
): number =>
  a.rank < b.rank
    ? -1
    : a.rank > b.rank
      ? 1
      : a.id < b.id
        ? -1
        : a.id > b.id
          ? 1
          : 0
