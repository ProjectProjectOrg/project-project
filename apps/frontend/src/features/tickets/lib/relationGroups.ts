import type {
  LinkedTicket,
  MarkKind,
  MarkTicketInput,
  TicketRelations
} from "@pp/shared"

export type RelationGroupKey =
  | "blockedBy"
  | "blocking"
  | "related"
  | "duplicateOf"
  | "duplicates"

export type RelationGroup = Readonly<{
  key: RelationGroupKey
  unmark: MarkKind | null
  tickets: ReadonlyArray<LinkedTicket>
}>

export const relationGroups = (
  relations: TicketRelations
): ReadonlyArray<RelationGroup> =>
  [
    { key: "blockedBy", unmark: "blockedBy", tickets: relations.blockedBy },
    { key: "blocking", unmark: "blocking", tickets: relations.blocking },
    { key: "related", unmark: "related", tickets: relations.related },
    {
      key: "duplicateOf",
      unmark: null,
      tickets: relations.duplicateOf === null ? [] : [relations.duplicateOf]
    },
    { key: "duplicates", unmark: null, tickets: relations.duplicates }
  ] satisfies ReadonlyArray<RelationGroup>

export const removableRelations = (relations: TicketRelations) =>
  relationGroups(relations).flatMap(({ unmark, tickets }) =>
    unmark === null ? [] : tickets.map((linked) => ({ kind: unmark, linked }))
  )

const MARK_GROUPS: Readonly<
  Record<MarkKind, "blockedBy" | "blocking" | "related">
> = {
  blockedBy: "blockedBy",
  blocking: "blocking",
  related: "related"
}

export const withoutRelation = (
  relations: TicketRelations,
  { kind, target }: MarkTicketInput
): TicketRelations => {
  const group = MARK_GROUPS[kind]
  return {
    ...relations,
    [group]: relations[group].filter((ticket) => ticket.id !== target)
  }
}

export type MarkPickKind = MarkKind | "duplicateOf"

export type PickBlock = "linked" | "loop" | null

const hasTicket = (tickets: ReadonlyArray<LinkedTicket>, id: string) =>
  tickets.some((ticket) => ticket.id === id)

const LOOP_GROUPS: Readonly<
  Record<MarkPickKind, "blockedBy" | "blocking" | "duplicates" | null>
> = {
  blockedBy: "blocking",
  blocking: "blockedBy",
  related: null,
  duplicateOf: "duplicates"
}

const LINKED_GROUPS: Readonly<
  Record<MarkPickKind, "blockedBy" | "blocking" | "related" | null>
> = {
  blockedBy: "blockedBy",
  blocking: "blocking",
  related: "related",
  duplicateOf: null
}

export const pickBlock = (
  relations: TicketRelations,
  kind: MarkPickKind,
  target: string
): PickBlock => {
  const linked = LINKED_GROUPS[kind]
  if (linked !== null && hasTicket(relations[linked], target)) return "linked"
  const loop = LOOP_GROUPS[kind]
  return loop !== null && hasTicket(relations[loop], target) ? "loop" : null
}

export const openBlockers = (
  relations: TicketRelations,
  finished: ReadonlySet<string>
): ReadonlyArray<LinkedTicket> =>
  relations.blockedBy.filter(
    (ticket) => ticket.archivedAt === null && !finished.has(ticket.status)
  )
