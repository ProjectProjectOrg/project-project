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

export const exampleTypes = (library: Library) => galleryTypesFor(library)

export const exampleSections = (library: Library) => galleryBlocksFor(library)

export const newTypeDraft = (
  example: TypeDraft | null,
  values: NewEntryValues
) =>
  ({
    key: TypeKey.make(values.key),
    name: values.name,
    icon: values.icon ?? example?.icon ?? NEW_TYPE_ICON,
    color: example?.color ?? null,
    description: example?.description ?? "",
    priority: example?.priority ?? null,
    tags: example?.tags ?? [],
    body: example?.body ?? ""
  }) satisfies TypeDraft

export const newSectionDraft = (
  example: BlockDraft | null,
  values: NewEntryValues
) =>
  ({
    key: BlockKey.make(values.key),
    name: values.name,
    icon: values.icon ?? example?.icon ?? FALLBACK_BLOCK_ICON,
    color: example?.color ?? null,
    description: example?.description ?? "",
    sync: example?.sync ?? false,
    content: example?.content ?? `## ${values.name}`
  }) satisfies BlockDraft

export const sectionsNeededBy = (target: Library, type: TypeDraft) =>
  galleryBlocksToAdopt(target, type)

const asBuiltin = (draft: BlockDraft) =>
  ({
    ...draft,
    origin: "builtin",
    shadows: null,
    hidden: false
  }) satisfies BlockDefinition

export const libraryWithExamples = (library: Library) =>
  ({
    ...library,
    blocks: [...library.blocks, ...galleryBlocksFor(library).map(asBuiltin)]
  }) satisfies Library

export const takenKeys = (
  libraries: ReadonlyArray<Library>,
  kind: LibraryKind
) =>
  new Set<string>(
    libraries.flatMap((library) =>
      (kind === "type" ? library.types : library.blocks).map(
        (entry) => entry.key
      )
    )
  )
