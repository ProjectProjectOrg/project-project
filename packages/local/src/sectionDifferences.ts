import type { Ticket, TicketCounts, TicketListPage } from "@pp/shared"

type Sections = Readonly<{
  counts: TicketCounts
  sections: Readonly<Record<string, TicketListPage>>
}>

const DERIVED = [
  "parent",
  "subTicketCount",
  "subTicketDoneCount",
  "openBlockerCount",
  "openBlockingCount",
  "relatedCount",
  "duplicateCount",
  "gitState"
] as const satisfies ReadonlyArray<keyof Ticket>

type Derived = (typeof DERIVED)[number]

const same = <K extends Derived>(a: Ticket[K], b: Ticket[K]) =>
  JSON.stringify(a) === JSON.stringify(b)

export const sectionDifferences = (
  local: Sections,
  server: Sections
): ReadonlyArray<string> => {
  const differences: Array<string> = []
  const mineCounts = new Map<string, number>(
    Object.entries(local.counts.byStatus)
  )
  const theirCounts = new Map<string, number>(
    Object.entries(server.counts.byStatus)
  )
  const localSections = new Map(Object.entries(local.sections))
  const serverSections = new Map(Object.entries(server.sections))
  for (const status of new Set([...mineCounts.keys(), ...theirCounts.keys()])) {
    const mine = mineCounts.get(status)
    const theirs = theirCounts.get(status)
    if (mine !== theirs)
      differences.push(`count ${status}: ${mine} vs ${theirs}`)
    const localRows = localSections.get(status)?.items ?? []
    const serverRows = serverSections.get(status)?.items ?? []
    const shared = Math.min(localRows.length, serverRows.length)
    for (let index = 0; index < shared; index++) {
      const a = localRows[index]
      const b = serverRows[index]
      if (a === undefined || b === undefined) continue
      if (a.ticket.id !== b.ticket.id || a.orderKey !== b.orderKey) {
        differences.push(
          `${status}[${index}]: ${a.ticket.id} vs ${b.ticket.id}`
        )
        break
      }
      for (const field of DERIVED)
        if (!same(a.ticket[field], b.ticket[field]))
          differences.push(`${a.ticket.id}.${field}`)
    }
  }
  return differences
}
