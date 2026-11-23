import { createContext, useContext, useMemo, type ReactNode } from "react"

import { LibraryContext } from "./block-chrome"
import type { EditorBlocks } from "./editor-blocks"

export type EditorBlocksScope = Readonly<{
  blocks: EditorBlocks
}>

export const EditorBlocksContext = createContext<EditorBlocksScope | null>(null)

export function EditorBlocksProvider({
  blocks,
  children
}: Readonly<{
  blocks: EditorBlocks | undefined
  children: ReactNode
}>) {
  const scope = useMemo(
    () => (blocks === undefined ? null : { blocks }),
    [blocks]
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
