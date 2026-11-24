import type {
  LinkedTicket,
  MarkKind,
  MarkTicketInput,
  TicketRelations
} from "@pp/shared"

import { m } from "@/paraglide/messages"

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

export const relationGroups = (relations: TicketRelations) =>
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

export type RelationPreviewKind = Exclude<RelationGroupKey, "duplicateOf">

const PREVIEW_GROUPS: Readonly<
  Record<RelationPreviewKind, ReadonlySet<RelationGroupKey>>
> = {
  blockedBy: new Set(["blockedBy"]),
  blocking: new Set(["blocking"]),
  related: new Set(["related"]),
  duplicates: new Set(["duplicateOf", "duplicates"])
}

const OPEN_ONLY: ReadonlySet<RelationGroupKey> = new Set([
  "blockedBy",
  "blocking"
])

export function previewRelationGroups(
  relations: TicketRelations,
  relation: RelationPreviewKind,
  finished: ReadonlySet<string>
) {
  return relationGroups(relations).flatMap((group) => {
    if (!PREVIEW_GROUPS[relation].has(group.key)) return []
    const tickets = group.tickets.filter(
      (ticket) =>
        group.key === "duplicateOf" ||
        group.key === "duplicates" ||
        (ticket.archivedAt === null &&
          !(OPEN_ONLY.has(group.key) && finished.has(ticket.status)))
    )
    return tickets.length === 0 ? [] : [{ ...group, tickets }]
  })
}

export const removableRelations = (relations: TicketRelations) =>
  relationGroups(relations).flatMap(({ unmark, tickets }) =>
    unmark === null ? [] : tickets.map((linked) => ({ kind: unmark, linked }))
  )

export const linkedTicket = ({
  id,
  title,
  status,
  archivedAt
}: LinkedTicket) => ({
  id,
  title,
  status,
  archivedAt
})

export type AddRelation = Readonly<{ kind: MarkKind; target: LinkedTicket }>

export const withRelation = (
  relations: TicketRelations,
  {
    kind,
    target
  }: Readonly<{ kind: MarkKind | "duplicates"; target: LinkedTicket }>
) =>
  hasTicket(relations[kind], target.id)
    ? relations
    : {
        ...relations,
        [kind]: [...relations[kind], target].sort((a, b) =>
          a.id.localeCompare(b.id, undefined, { numeric: true })
        )
      }

export const withoutRelation = (
  relations: TicketRelations,
  { kind, target }: MarkTicketInput
) => ({
  ...relations,
  [kind]: relations[kind].filter((ticket) => ticket.id !== target)
})

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
) => {
  const linked = LINKED_GROUPS[kind]
  if (linked !== null && hasTicket(relations[linked], target)) return "linked"
  const loop = LOOP_GROUPS[kind]
  return loop !== null && hasTicket(relations[loop], target) ? "loop" : null
}

export const openBlockers = (
  relations: TicketRelations,
  finished: ReadonlySet<string>
) =>
  relations.blockedBy.filter(
    (ticket) => ticket.archivedAt === null && !finished.has(ticket.status)
  )

export const RELATION_PREVIEW_LABELS: Readonly<
  Record<RelationGroupKey, () => string>
> = {
  blockedBy: m.tickets_preview_blocked_by,
  blocking: m.tickets_preview_blocking,
  related: m.tickets_preview_related,
  duplicateOf: m.tickets_preview_duplicate_of,
  duplicates: m.tickets_preview_duplicates
}
