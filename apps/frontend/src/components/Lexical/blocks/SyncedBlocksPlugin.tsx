import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { mergeRegister } from "@lexical/utils"
import type { Library } from "@pp/shared"
import type { LexicalEditor, NodeKey } from "lexical"
import { useContext, useEffect, useMemo, useRef } from "react"

import { lookupFor } from "@/components/blocks/blockChrome"
import { m } from "@/paraglide/messages"

import { EditorBlocksContext } from "./editorBlocksContext"
import { registerSyncedBlocks } from "./syncedBlocks"

const markSourceRemoved = (
  editor: LexicalEditor,
  keys: ReadonlySet<NodeKey>
) => {
  for (const key of keys) {
    const element = editor.getElementByKey(key)
    if (element === null || element.dataset.sourceRemoved !== undefined)
      continue
    element.dataset.sourceRemoved = ""
    element.style.setProperty(
      "--source-removed-note",
      JSON.stringify(m.editor_synced_source_removed())
    )
  }
}

export function SyncedBlocksPlugin({
  library
}: Readonly<{ library: Library }>) {
  const [editor] = useLexicalComposerContext()
  const transformers = useContext(EditorBlocksContext)?.transformers
  const lookup = useMemo(() => lookupFor(library), [library])
  const removed = useRef(new Set<NodeKey>())

  useEffect(() => {
    if (transformers === undefined) return
    const keys = removed.current
    return mergeRegister(
      editor.registerUpdateListener(() => markSourceRemoved(editor, keys)),
      registerSyncedBlocks(editor, lookup, transformers, (key) => keys.add(key))
    )
  }, [editor, lookup, transformers])

  return null
}
