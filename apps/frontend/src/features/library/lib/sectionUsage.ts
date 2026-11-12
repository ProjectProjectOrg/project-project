import {
  parseTicketBlocks,
  type Library,
  type TypeDefinition
} from "@pp/shared"

const sectionKeysOf = (type: TypeDefinition): ReadonlySet<string> =>
  new Set(
    parseTicketBlocks(type.body).flatMap((segment) =>
      segment.kind === "block" ? [segment.type] : []
    )
  )

export type SectionUsage = ReadonlyMap<string, ReadonlyArray<TypeDefinition>>

export const usageBySection = (library: Library): SectionUsage => {
  const usage = new Map<string, Array<TypeDefinition>>()
  for (const type of library.types) {
    if (type.hidden) continue
    for (const key of sectionKeysOf(type))
      usage.set(key, [...(usage.get(key) ?? []), type])
  }
  return usage
}

export const typesUsingSection = (
  library: Library,
  key: string
): ReadonlyArray<TypeDefinition> => usageBySection(library).get(key) ?? []
