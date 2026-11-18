import {
  parseTicketBlocks,
  type Library,
  type TypeDefinition,
  TicketBlockSegment
} from "@pp/shared"

const sectionKeysOf = (type: TypeDefinition) =>
  new Set(
    parseTicketBlocks(type.body).flatMap((segment) =>
      TicketBlockSegment.$is("block")(segment) ? [segment.type] : []
    )
  )

export type SectionUsage = ReadonlyMap<string, ReadonlyArray<TypeDefinition>>

export const usageBySection = (library: Library) => {
  const usage = new Map<string, Array<TypeDefinition>>()
  for (const type of library.types) {
    if (type.hidden) continue
    for (const key of sectionKeysOf(type))
      usage.set(key, [...(usage.get(key) ?? []), type])
  }
  return usage
}

export const typesUsingSection = (library: Library, key: string) =>
  usageBySection(library).get(key) ?? []
