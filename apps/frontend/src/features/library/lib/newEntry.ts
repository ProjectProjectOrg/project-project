import {
  BlockKey,
  FALLBACK_BLOCK_ICON,
  galleryBlocksFor,
  galleryBlocksToAdopt,
  galleryTypesFor,
  TypeKey,
  type BlockDefinition,
  type BlockDraft,
  type BlockIconName,
  type Library,
  type TypeDraft
} from "@pp/shared"

import type { LibraryKind } from "./libraryModel"

export const NEW_TYPE_ICON: BlockIconName = "LayoutTemplate"

export type NewEntryValues = Readonly<{
  key: string
  name: string
  icon: BlockIconName | null
}>

export const exampleTypes = (library: Library): ReadonlyArray<TypeDraft> =>
  galleryTypesFor(library)

export const exampleSections = (library: Library): ReadonlyArray<BlockDraft> =>
  galleryBlocksFor(library)

export const newTypeDraft = (
  example: TypeDraft | null,
  values: NewEntryValues
): TypeDraft => ({
  key: TypeKey.make(values.key),
  name: values.name,
  icon: values.icon ?? example?.icon ?? NEW_TYPE_ICON,
  color: example?.color ?? null,
  description: example?.description ?? "",
  priority: example?.priority ?? null,
  tags: example?.tags ?? [],
  body: example?.body ?? ""
})

export const newSectionDraft = (
  example: BlockDraft | null,
  values: NewEntryValues
): BlockDraft => ({
  key: BlockKey.make(values.key),
  name: values.name,
  icon: values.icon ?? example?.icon ?? FALLBACK_BLOCK_ICON,
  color: example?.color ?? null,
  description: example?.description ?? "",
  sync: example?.sync ?? false,
  content: example?.content ?? `## ${values.name}`
})

export const sectionsNeededBy = (
  target: Library,
  type: TypeDraft
): ReadonlyArray<BlockDraft> => galleryBlocksToAdopt(target, type)

const asBuiltin = (draft: BlockDraft): BlockDefinition => ({
  ...draft,
  origin: "builtin",
  shadows: null,
  hidden: false
})

export const libraryWithExamples = (library: Library): Library => ({
  ...library,
  blocks: [...library.blocks, ...galleryBlocksFor(library).map(asBuiltin)]
})

export const takenKeys = (
  libraries: ReadonlyArray<Library>,
  kind: LibraryKind
): ReadonlySet<string> =>
  new Set(
    libraries.flatMap((library) =>
      (kind === "type" ? library.types : library.blocks).map(
        (entry) => entry.key
      )
    )
  )
