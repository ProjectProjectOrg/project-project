import {
  EMPTY_TICKET_RELATIONS,
  type MarkTicketInput,
  Validation,
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

export const relationsFromRows = (
  rows: ReadonlyArray<RelationRow>
): TicketRelations => {
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
  }
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
): ReadonlyArray<TicketId> | null => {
  const graph = blockedByGraph(edges)
  const visited = new Set<TicketId>()
  const walk = (
    current: TicketId,
    path: ReadonlyArray<TicketId>
  ): ReadonlyArray<TicketId> | null => {
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

export const relationValidation = (
  reason: string,
  ids: ReadonlyArray<string>
) => new Validation({ reason: `${reason}:${ids.join(",")}` })

export const relationTargetFailure = (
  ticket: TicketId | null,
  targets: ReadonlyArray<TicketId>,
  existing: ReadonlySet<string>
): Validation | null => {
  if (ticket !== null && targets.includes(ticket)) {
    return relationValidation("relation_self", [ticket])
  }
  const unknown = targets.filter((target) => !existing.has(target))
  return unknown.length > 0
    ? relationValidation("unknown_tickets", unknown)
    : null
}

export const validateBlockers = (
  edges: ReadonlyArray<RelationEdge>,
  ticket: TicketId,
  blockers: ReadonlyArray<TicketId>
): Validation | null => {
  if (blockers.includes(ticket))
    return relationValidation("relation_self", [ticket])
  const others = edges.filter(
    (edge) => !(edge.kind === "blocked_by" && edge.from === ticket)
  )
  for (const blocker of blockers) {
    const cycle = blockingCycle(others, ticket, blocker)
    if (cycle !== null) return relationValidation("blocking_cycle", cycle)
  }
  return null
}

export const validateDuplicate = (
  edges: ReadonlyArray<RelationEdge>,
  ticket: TicketId,
  original: TicketId
): Validation | null => {
  if (ticket === original) return relationValidation("relation_self", [ticket])
  const originalOf = edges.find(
    (edge) => edge.kind === "duplicate_of" && edge.from === original
  )
  if (originalOf !== undefined) {
    return relationValidation("duplicate_of_duplicate", [
      original,
      originalOf.to
    ])
  }
  const duplicates = edges.flatMap((edge) =>
    edge.kind === "duplicate_of" && edge.to === ticket ? [edge.from] : []
  )
  if (duplicates.length > 0) {
    return relationValidation("has_duplicates", duplicates)
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

export const markWrite = (
  ticket: TicketId,
  input: MarkTicketInput
): RelationWrite => MARK_WRITES[input.kind](ticket, input.target)

export const unmarkWrites = (
  ticket: TicketId,
  input: MarkTicketInput
): ReadonlyArray<RelationWrite> =>
  input.kind === "related"
    ? [
        { owner: ticket, field: "relatedTo", id: input.target },
        { owner: input.target, field: "relatedTo", id: ticket }
      ]
    : [markWrite(ticket, input)]

export const validateMark = (
  edges: ReadonlyArray<RelationEdge>,
  ticket: TicketId,
  input: MarkTicketInput
): Validation | null => {
  const write = markWrite(ticket, input)
  return write.field === "blockedBy"
    ? validateBlockers(edges, write.owner, [write.id])
    : null
}

export const isRelated = (
  edges: ReadonlyArray<RelationEdge>,
  a: TicketId,
  b: TicketId
): boolean =>
  edges.some(
    (edge) =>
      edge.kind === "related" &&
      ((edge.from === a && edge.to === b) || (edge.from === b && edge.to === a))
  )

export const withRelation = (
  list: ReadonlyArray<TicketId> | undefined,
  id: TicketId
): ReadonlyArray<TicketId> => [...new Set([...(list ?? []), id])]

export const withoutRelation = (
  list: ReadonlyArray<TicketId> | undefined,
  id: TicketId
): ReadonlyArray<TicketId> | undefined => {
  const rest = (list ?? []).filter((entry) => entry !== id)
  return rest.length === 0 ? undefined : rest
}
