import type {
  FixReferenceInput,
  ReferenceKind,
  ReferencesToFix,
  ReferenceToFix
} from "@pp/shared"

export type ReferenceOccurrences = Readonly<{
  ticketId: string
  snippets: ReadonlyArray<string>
}>

export type ReferenceGroup = Readonly<{
  kind: ReferenceKind
  target: string
  label: string
  count: number
  tickets: ReadonlyArray<ReferenceOccurrences>
}>

const groupKey = (item: Pick<ReferenceToFix, "kind" | "target">) =>
  `${item.kind}\u0000${item.target}`

export const groupReferences = (
  items: ReadonlyArray<ReferenceToFix>
): ReadonlyArray<ReferenceGroup> => {
  const groups = new Map<
    string,
    { first: ReferenceToFix; tickets: Map<string, Array<string>> }
  >()
  for (const item of items) {
    const key = groupKey(item)
    const group = groups.get(key) ?? { first: item, tickets: new Map() }
    groups.set(key, group)
    const snippets = group.tickets.get(item.ticketId) ?? []
    group.tickets.set(item.ticketId, [...snippets, item.snippet])
  }
  return [...groups.values()].map(({ first, tickets }) => ({
    kind: first.kind,
    target: first.target,
    label: first.label,
    count: [...tickets.values()].reduce((sum, list) => sum + list.length, 0),
    tickets: [...tickets].map(([ticketId, snippets]) => ({
      ticketId,
      snippets: [...new Set(snippets)]
    }))
  }))
}

export const withoutFixed = (
  references: ReferencesToFix,
  input: FixReferenceInput
): ReferencesToFix => ({
  items: references.items.filter(
    (item) =>
      groupKey(item) !== groupKey(input) ||
      (input.ticketId !== null && item.ticketId !== input.ticketId)
  )
})
