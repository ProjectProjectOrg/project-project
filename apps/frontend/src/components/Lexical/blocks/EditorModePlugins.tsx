import type { Transformer } from "@lexical/markdown"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useEffect } from "react"

import { registerNoNestedBlocks } from "./definitionMode"

export function DefinitionModePlugin({
  transformers
}: Readonly<{ transformers: ReadonlyArray<Transformer> }>) {
  const [editor] = useLexicalComposerContext()
  useEffect(
    () => registerNoNestedBlocks(editor, transformers),
    [editor, transformers]
  )
  return null
}
