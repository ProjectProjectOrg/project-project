import {
  EMPTY_TICKET_RELATIONS,
  type MarkTicketInput,
  RelationInvalid,
  type LinkedTicket,
  type TicketId,
  type TicketRelations
} from "@pp/shared"

export type RelationEdgeKind = "blocked_by" | "related" | "duplicate_of"

export type RelationEdge = Readonly<{
  from: TicketId
  to: TicketId
  kind: RelationEdgeKind
}>

export type RelationRow = Readonly<{
  direction: "out" | "in"
  kind: RelationEdgeKind
  other: LinkedTicket
}>

const byId = (a: LinkedTicket, b: LinkedTicket) =>
  a.id.localeCompare(b.id, undefined, { numeric: true })

export const relationsFromRows = (rows: ReadonlyArray<RelationRow>) => {
  const pick = (direction: RelationRow["direction"], kind: RelationEdgeKind) =>
    rows
      .flatMap((row) =>
        row.direction === direction && row.kind === kind ? [row.other] : []
      )
      .toSorted(byId)
  const related = new Map(
    rows.flatMap((row) =>
      row.kind === "related" ? [[row.other.id, row.other] as const] : []
    )
  )
  return {
    ...EMPTY_TICKET_RELATIONS,
    blockedBy: pick("out", "blocked_by"),
    blocking: pick("in", "blocked_by"),
    related: [...related.values()].toSorted(byId),
    duplicateOf: pick("out", "duplicate_of")[0] ?? null,
    duplicates: pick("in", "duplicate_of")
  } satisfies TicketRelations
}

const blockedByGraph = (edges: ReadonlyArray<RelationEdge>) => {
  const graph = new Map<TicketId, Array<TicketId>>()
  for (const edge of edges) {
    if (edge.kind !== "blocked_by") continue
    graph.set(edge.from, [...(graph.get(edge.from) ?? []), edge.to])
  }
  return graph
}

export const blockingCycle = (
  edges: ReadonlyArray<RelationEdge>,
  ticket: TicketId,
  blocker: TicketId
) => {
  const graph = blockedByGraph(edges)
  const visited = new Set<TicketId>()
  const walk: (
    current: TicketId,
    path: ReadonlyArray<TicketId>
  ) => ReadonlyArray<TicketId> | null = (current, path) => {
    if (current === ticket) return path
    if (visited.has(current)) return null
    visited.add(current)
    for (const next of graph.get(current) ?? []) {
      const found = walk(next, [...path, next])
      if (found !== null) return found
    }
    return null
  }
  return walk(blocker, [ticket, blocker])
}

export const relationTargetFailure = (
  ticket: TicketId | null,
  targets: ReadonlyArray<TicketId>,
  existing: ReadonlySet<string>
) => {
  if (ticket !== null && targets.includes(ticket)) {
    return new RelationInvalid({ kind: "relation_self", ids: [ticket] })
  }
  const unknown = targets.filter((target) => !existing.has(target))
  return unknown.length > 0
    ? new RelationInvalid({ kind: "unknown_tickets", ids: unknown })
    : null
}

export const validateBlockers = (
  edges: ReadonlyArray<RelationEdge>,
  ticket: TicketId,
  blockers: ReadonlyArray<TicketId>
) => {
  if (blockers.includes(ticket))
    return new RelationInvalid({ kind: "relation_self", ids: [ticket] })
  const others = edges.filter(
    (edge) => !(edge.kind === "blocked_by" && edge.from === ticket)
  )
  for (const blocker of blockers) {
    const cycle = blockingCycle(others, ticket, blocker)
    if (cycle !== null)
      return new RelationInvalid({ kind: "blocking_cycle", ids: cycle })
  }
  return null
}

export const validateDuplicate = (
  edges: ReadonlyArray<RelationEdge>,
  ticket: TicketId,
  original: TicketId
) => {
  if (ticket === original)
    return new RelationInvalid({ kind: "relation_self", ids: [ticket] })
  const originalOf = edges.find(
    (edge) => edge.kind === "duplicate_of" && edge.from === original
  )
  if (originalOf !== undefined) {
    return new RelationInvalid({
      kind: "duplicate_of_duplicate",
      ids: [original, originalOf.to]
    })
  }
  const duplicates = edges.flatMap((edge) =>
    edge.kind === "duplicate_of" && edge.to === ticket ? [edge.from] : []
  )
  if (duplicates.length > 0) {
    return new RelationInvalid({ kind: "has_duplicates", ids: duplicates })
  }
  return null
}

export type OwnedRelationField = "blockedBy" | "relatedTo"

export type RelationWrite = Readonly<{
  owner: TicketId
  field: OwnedRelationField
  id: TicketId
}>

const MARK_WRITES: Readonly<
  Record<
    MarkTicketInput["kind"],
    (ticket: TicketId, target: TicketId) => RelationWrite
  >
> = {
  blockedBy: (ticket, target) => ({
    owner: ticket,
    field: "blockedBy",
    id: target
  }),
  blocking: (ticket, target) => ({
    owner: target,
    field: "blockedBy",
    id: ticket
  }),
  related: (ticket, target) => ({
    owner: ticket,
    field: "relatedTo",
    id: target
  })
}

export const markWrite = (ticket: TicketId, input: MarkTicketInput) =>
  MARK_WRITES[input.kind](ticket, input.target)

export const unmarkWrites = (ticket: TicketId, input: MarkTicketInput) =>
  input.kind === "related"
    ? ([
        { owner: ticket, field: "relatedTo", id: input.target },
        { owner: input.target, field: "relatedTo", id: ticket }
      ] satisfies ReadonlyArray<RelationWrite>)
    : [markWrite(ticket, input)]

export const validateMark = (
  edges: ReadonlyArray<RelationEdge>,
  ticket: TicketId,
  input: MarkTicketInput
) => {
  const write = markWrite(ticket, input)
  return write.field === "blockedBy"
    ? validateBlockers(edges, write.owner, [write.id])
    : null
}

export const isRelated = (
  edges: ReadonlyArray<RelationEdge>,
  a: TicketId,
  b: TicketId
) =>
  edges.some(
    (edge) =>
      edge.kind === "related" &&
      ((edge.from === a && edge.to === b) || (edge.from === b && edge.to === a))
  )

export const withRelation = (
  list: ReadonlyArray<TicketId> | undefined,
  id: TicketId
) => [...new Set([...(list ?? []), id])]

export const withoutRelation = (
  list: ReadonlyArray<TicketId> | undefined,
  id: TicketId
) => {
  const rest = (list ?? []).filter((entry) => entry !== id)
  return rest.length === 0 ? undefined : rest
}
