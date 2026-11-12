import type {
  BlockDefinition,
  Library,
  LibraryOrigin,
  TypeKey
} from "@pp/shared"

export type EditorBlocksMode = "ticket" | "template" | "definition"

export type EditorBlocks = Readonly<{
  mode: EditorBlocksMode
  library: Library
  ticketType: TypeKey | null
  canEdit: Readonly<{ org: boolean; project: boolean }>
  onEditDefinition: (kind: "block", key: string, origin: LibraryOrigin) => void
  onMakeDefinition?: (definition: BlockDefinition, content: string) => void
}>

export const hasBlockGutter = (blocks: EditorBlocks | undefined): boolean =>
  blocks !== undefined && blocks.mode !== "definition"
