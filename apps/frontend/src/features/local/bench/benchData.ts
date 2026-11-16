import type { GroupFact, ProjectSync, StatusFact, TicketFact } from "@pp/shared"
import * as DateTime from "effect/DateTime"

export const STATUSES = ["todo", "in_progress", "review", "done"] as const
export const WINDOW = 100
export const SPRINT_SIZE = 50

type Snapshot = Extract<ProjectSync, { kind: "snapshot" }>
type Changes = Extract<ProjectSync, { kind: "changes" }>

const random = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

const pad = (n: number) => n.toString(36).padStart(5, "0")
const at = DateTime.toDateUtc(DateTime.makeUnsafe("2026-11-16T10:00:00Z"))

const statuses: ReadonlyArray<StatusFact> = STATUSES.map((slug, index) => ({
  slug,
  label: slug,
  icon: "circle",
  color: "#3b82f6",
  orderKey: `a${index}`,
  description: null
}))

export const generate = (size: number, seed = 1): Snapshot => {
  const next = random(seed)
  const pick = <A>(values: ReadonlyArray<A>) =>
    values[Math.floor(next() * values.length)] as A
  const tickets: Array<TicketFact> = []
  for (let n = 0; n < size; n++) {
    const id = `T-${n + 1}`
    const parent =
      n > 12 && n % 400 === 0
        ? SUB_TICKET_PARENT
        : n > 10 && next() < 0.2
          ? `T-${Math.floor(next() * n) + 1}`
          : null
    const relations = Array.from({ length: Math.floor(next() * 4) }, () => ({
      to: `T-${Math.floor(next() * size) + 1}`,
      kind: "blocked_by" as const
    })).filter(
      (relation, index, all) =>
        relation.to !== id &&
        all.findIndex((other) => other.to === relation.to) === index
    )
    tickets.push({
      id,
      title: `Ticket ${n + 1}`,
      status: pick(STATUSES),
      type: null,
      priority: pick(["low", "med", "high"] as const),
      rank: pad(Math.floor(next() * 36 ** 5)),
      estimate: null,
      tags: [],
      assignees: [],
      parent,
      relations,
      flag: null,
      git: null,
      archivedAt: next() < 0.05 ? at : null,
      createdBy: "bench",
      createdAt: at,
      updatedAt: at
    })
  }
  const groups: Array<GroupFact> = []
  for (let start = 0; start < size; start += SPRINT_SIZE * 4)
    groups.push({
      id: `G-${groups.length + 1}`,
      kind: "sprint",
      name: `Sprint ${groups.length + 1}`,
      color: "#3b82f6",
      startsAt: null,
      endsAt: null,
      completedAt: null,
      tickets: tickets.slice(start, start + SPRINT_SIZE).map((t) => t.id),
      createdBy: "bench",
      createdAt: at,
      updatedAt: at
    })
  return {
    kind: "snapshot",
    cursor: "1.0",
    project: {
      id: "bench",
      key: "T",
      name: "Bench",
      icon: "folder",
      color: "blue",
      estimation: "off"
    },
    tickets,
    groups,
    statuses,
    tags: [],
    members: []
  }
}

export type Edit =
  | Readonly<{ kind: "status"; id: string; status: string }>
  | Readonly<{ kind: "parent"; id: string; parent: string | null }>
  | Readonly<{ kind: "blocker"; id: string; to: string; add: boolean }>
  | Readonly<{ kind: "archive"; id: string; archived: boolean }>
  | Readonly<{ kind: "delete"; id: string }>

export const randomEdits = (
  snapshot: Snapshot,
  count: number,
  seed = 7
): ReadonlyArray<Edit> => {
  const next = random(seed)
  const id = () =>
    snapshot.tickets[Math.floor(next() * snapshot.tickets.length)]?.id ?? "T-1"
  return Array.from({ length: count }, (): Edit => {
    const roll = next()
    if (roll < 0.4)
      return {
        kind: "status",
        id: id(),
        status: STATUSES[Math.floor(next() * STATUSES.length)] ?? "todo"
      }
    if (roll < 0.6)
      return { kind: "parent", id: id(), parent: next() < 0.3 ? null : id() }
    if (roll < 0.8)
      return { kind: "blocker", id: id(), to: id(), add: next() < 0.6 }
    if (roll < 0.95)
      return { kind: "archive", id: id(), archived: next() < 0.5 }
    return { kind: "delete", id: id() }
  })
}

export const applyEdit = (
  tickets: ReadonlyMap<string, TicketFact>,
  edit: Edit
): TicketFact | null => {
  const ticket = tickets.get(edit.id)
  if (ticket === undefined || edit.kind === "delete") return null
  switch (edit.kind) {
    case "status":
      return { ...ticket, status: edit.status }
    case "parent":
      return {
        ...ticket,
        parent: edit.parent === ticket.id ? null : edit.parent
      }
    case "blocker": {
      const others = ticket.relations.filter((r) => r.to !== edit.to)
      return {
        ...ticket,
        relations:
          edit.add && edit.to !== ticket.id
            ? [...others, { to: edit.to, kind: "blocked_by" }]
            : others
      }
    }
    case "archive":
      return { ...ticket, archivedAt: edit.archived ? at : null }
  }
}

export const changesFor = (
  cursor: string,
  upserts: ReadonlyArray<TicketFact>,
  deletes: ReadonlyArray<string>
): Changes => ({
  kind: "changes",
  cursor,
  project: null,
  upserts: {
    tickets: upserts,
    groups: [],
    statuses: [],
    tags: [],
    members: []
  },
  deletes: {
    tickets: deletes,
    groups: [],
    statuses: [],
    tags: [],
    members: []
  },
  comments: []
})

export type Views = Readonly<{
  counts: Readonly<Record<string, number>>
  sections: Readonly<Record<string, ReadonlyArray<string>>>
  sprints: Readonly<Record<string, Readonly<{ total: number; done: number }>>>
  subTickets: ReadonlyArray<string>
  openBlockers: Readonly<Record<string, number>>
}>

export const SUB_TICKET_PARENT = "T-12"

const byRank = (a: TicketFact, b: TicketFact) =>
  a.rank < b.rank
    ? -1
    : a.rank > b.rank
      ? 1
      : a.id < b.id
        ? -1
        : a.id > b.id
          ? 1
          : 0

export const referenceViews = (
  tickets: ReadonlyArray<TicketFact>,
  groups: ReadonlyArray<GroupFact>
): Views => {
  const live = tickets.filter((t) => t.archivedAt === null)
  const byId = new Map(tickets.map((t) => [t.id, t]))
  const counts: Record<string, number> = {}
  const sections: Record<string, ReadonlyArray<string>> = {}
  for (const status of STATUSES) {
    const rows = live.filter((t) => t.status === status).toSorted(byRank)
    if (rows.length === 0) continue
    counts[status] = rows.length
    sections[status] = rows.slice(0, WINDOW).map((t) => t.id)
  }
  const sprints: Record<string, { total: number; done: number }> = {}
  for (const group of groups) {
    const members = group.tickets.flatMap((id) => {
      const ticket = byId.get(id)
      return ticket === undefined ? [] : [ticket]
    })
    if (members.length > 0)
      sprints[group.id] = {
        total: members.length,
        done: members.filter((t) => t.status === "done").length
      }
  }
  const visible = new Set(Object.values(sections).flat())
  const openBlockers: Record<string, number> = {}
  for (const id of visible) {
    const open = (byId.get(id)?.relations ?? []).filter((relation) => {
      const blocker = byId.get(relation.to)
      return (
        relation.kind === "blocked_by" &&
        blocker !== undefined &&
        blocker.status !== "done"
      )
    }).length
    if (open > 0) openBlockers[id] = open
  }
  return {
    counts,
    sections,
    sprints,
    subTickets: live
      .filter((t) => t.parent === SUB_TICKET_PARENT)
      .toSorted(byRank)
      .map((t) => t.id),
    openBlockers
  }
}
