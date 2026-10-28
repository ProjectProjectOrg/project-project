import {
  EPIC_SECTION_NONE,
  matchesTicketQuery,
  type EpicSectionKey,
  type EstimationMode,
  type Ticket,
  type TicketCounts,
  type TicketId,
  type TicketListQuery,
  type TicketSort,
  type TicketStatus,
  type UpdateTicketInput,
  type UserId
} from "@pp/shared"

import {
  insertByOrderKey,
  patchTicketRow,
  type TicketRow,
  type TicketRowPage
} from "./ticketRows"

export type EpicSectionValue = Readonly<{
  key: EpicSectionKey
  title: string | null
  count: number
  page: TicketRowPage
}>

export type EpicSectionsValue = Readonly<{
  total: number
  counts: TicketCounts
  sections: ReadonlyArray<EpicSectionValue>
  viewer: Readonly<{
    id: UserId | undefined
    estimation: EstimationMode
  }>
}>

const sectionOf = (ticket: Ticket): EpicSectionKey =>
  ticket.parent ?? EPIC_SECTION_NONE

const moveRow = (
  sections: ReadonlyArray<EpicSectionValue>,
  row: TicketRow,
  from: EpicSectionKey,
  to: EpicSectionKey,
  dir: TicketSort["dir"]
): ReadonlyArray<EpicSectionValue> => {
  if (from === to || !sections.some((section) => section.key === to)) {
    return sections
  }
  return sections.map((section) => {
    if (section.key === from) {
      return {
        ...section,
        count: Math.max(0, section.count - 1),
        page: {
          ...section.page,
          items: section.page.items.filter(
            (item) => item.ticket.id !== row.ticket.id
          )
        }
      }
    }
    if (section.key === to) {
      return {
        ...section,
        count: section.count + 1,
        page: {
          ...section.page,
          items: insertByOrderKey(section.page.items, row, dir)
        }
      }
    }
    return section
  })
}

export const patchEpicSectionsRow = (
  value: EpicSectionsValue,
  id: TicketId,
  patch: UpdateTicketInput,
  query: TicketListQuery,
  now: Date
): EpicSectionsValue => {
  let patched: TicketRow | undefined
  let from: TicketStatus | undefined
  let fromSection: EpicSectionKey | undefined
  let staysCounted = true
  let staysVisible = true
  const sections = value.sections.map((section) => {
    const items: Array<TicketRow> = []
    let found: TicketRow | undefined
    for (const row of section.page.items) {
      if (row.ticket.id !== id) {
        items.push(row)
        continue
      }
      from = row.ticket.status
      fromSection = section.key
      found = patchTicketRow(row, patch, query.sort, now)
      patched = found
      staysCounted = matchesTicketQuery(
        found.ticket,
        { ...query, status: undefined },
        value.viewer.id,
        value.viewer.estimation
      )
      staysVisible = matchesTicketQuery(
        found.ticket,
        query,
        value.viewer.id,
        value.viewer.estimation
      )
    }
    if (found === undefined) return section
    return {
      ...section,
      count: section.count - (staysVisible ? 0 : 1),
      page: {
        ...section.page,
        items: staysVisible
          ? insertByOrderKey(items, found, query.sort.dir)
          : items
      }
    }
  })
  if (!patched || from === undefined || fromSection === undefined) return value
  const moved = staysVisible
    ? moveRow(
        sections,
        patched,
        fromSection,
        sectionOf(patched.ticket),
        query.sort.dir
      )
    : sections
  const to = patched.ticket.status
  if (to === from && staysCounted && staysVisible) {
    return { ...value, sections: moved }
  }
  const byStatus = { ...value.counts.byStatus }
  byStatus[from] = Math.max(0, (byStatus[from] ?? 0) - 1)
  if (staysCounted) byStatus[to] = (byStatus[to] ?? 0) + 1
  return {
    ...value,
    total: value.total - (staysVisible ? 0 : 1),
    counts: {
      total: value.counts.total - (staysCounted ? 0 : 1),
      byStatus
    },
    sections: moved
  }
}

export const replaceEpicSectionsRow = (
  value: EpicSectionsValue,
  ticket: Ticket,
  orderKey: string | null,
  sort: TicketSort
): EpicSectionsValue => {
  let fromSection: EpicSectionKey | undefined
  let replaced: TicketRow | undefined
  const sections = value.sections.map((section) => {
    const items: Array<TicketRow> = []
    for (const row of section.page.items) {
      if (row.ticket.id !== ticket.id) {
        items.push(row)
        continue
      }
      fromSection = section.key
      replaced = { ...row, ticket, orderKey: orderKey ?? row.orderKey }
    }
    if (replaced === undefined || fromSection !== section.key) return section
    return {
      ...section,
      page: {
        ...section.page,
        items:
          orderKey === null
            ? section.page.items.map((row) =>
                row.ticket.id === ticket.id && replaced ? replaced : row
              )
            : insertByOrderKey(items, replaced, sort.dir)
      }
    }
  })
  return replaced === undefined || fromSection === undefined
    ? value
    : {
        ...value,
        sections: moveRow(
          sections,
          replaced,
          fromSection,
          sectionOf(ticket),
          sort.dir
        )
      }
}
