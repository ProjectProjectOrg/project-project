import type { Library, LibraryOrigin } from "@pp/shared"

export type EditorBlocksMode = "ticket" | "definition"

export type EditorBlocks = Readonly<{
  mode: EditorBlocksMode
  library: Library
  canEdit: Readonly<{ org: boolean; project: boolean }>
  onEditDefinition: (kind: "block", key: string, origin: LibraryOrigin) => void
}>

export const hasBlockGutter = (blocks: EditorBlocks | undefined): boolean =>
  blocks !== undefined && blocks.mode !== "definition"
