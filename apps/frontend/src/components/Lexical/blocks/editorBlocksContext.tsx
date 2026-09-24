import type { Transformer } from "@lexical/markdown"
import { createContext, useContext, useMemo, type ReactNode } from "react"

import { LibraryContext } from "@/components/blocks/blockChrome"

import type { EditorBlocks } from "./editorBlocks"

export type EditorBlocksScope = Readonly<{
  blocks: EditorBlocks
  transformers: ReadonlyArray<Transformer>
}>

export const EditorBlocksContext = createContext<EditorBlocksScope | null>(null)

export function EditorBlocksProvider({
  blocks,
  transformers,
  children
}: Readonly<{
  blocks: EditorBlocks | undefined
  transformers: ReadonlyArray<Transformer>
  children: ReactNode
}>) {
  const scope = useMemo(
    () => (blocks === undefined ? null : { blocks, transformers }),
    [blocks, transformers]
  )
  const outerLibrary = useContext(LibraryContext)
  return (
    <EditorBlocksContext.Provider value={scope}>
      <LibraryContext.Provider value={scope?.blocks.library ?? outerLibrary}>
        {children}
      </LibraryContext.Provider>
    </EditorBlocksContext.Provider>
  )
}
