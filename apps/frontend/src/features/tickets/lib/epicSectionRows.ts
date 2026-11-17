import { EpicSectionKey, TicketCounts, TicketParent } from "@pp/shared"
import * as Schema from "effect/Schema"

import { FIRST_SCREEN_ROWS, TicketRowPage } from "./ticketRows"

export const EpicSectionValue = Schema.Struct({
  key: EpicSectionKey,
  parent: Schema.NullOr(TicketParent),
  count: Schema.Finite,
  page: TicketRowPage
})
export type EpicSectionValue = typeof EpicSectionValue.Type

export const EpicSectionsData = Schema.Struct({
  total: Schema.Finite,
  counts: TicketCounts,
  sections: Schema.Array(EpicSectionValue)
})
export type EpicSectionsData = typeof EpicSectionsData.Type

export const firstScreenSectionCount = (
  sections: ReadonlyArray<EpicSectionValue>
) => {
  let budget = FIRST_SCREEN_ROWS
  let count = 0
  for (const section of sections) {
    if (budget <= 0) break
    budget -= 1 + section.page.items.length
    count += 1
  }
  return count
}

export const firstScreenEpicSections = (
  data: EpicSectionsData
): EpicSectionsData => {
  let budget = FIRST_SCREEN_ROWS
  return {
    total: data.total,
    counts: data.counts,
    sections: data.sections
      .slice(0, firstScreenSectionCount(data.sections))
      .map((section) => {
        const items = section.page.items.slice(0, Math.max(0, budget - 1))
        budget -= 1 + items.length
        return {
          key: section.key,
          parent: section.parent,
          count: section.count,
          page: { items, nextCursor: null }
        }
      })
  }
}
