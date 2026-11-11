import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $getRoot,
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isRootNode
} from "lexical"
import { useEffect } from "react"

import { m } from "@/paraglide/messages"

const ATTRIBUTE = "data-line-placeholder"

export function LinePlaceholderPlugin() {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    let marked: HTMLElement | null = null
    const unmark = () => {
      marked?.removeAttribute(ATTRIBUTE)
      marked = null
    }
    const unregister = editor.registerUpdateListener(({ editorState }) => {
      const key = editorState.read(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection) || !selection.isCollapsed())
          return null
        const node = selection.anchor.getNode()
        if (!$isParagraphNode(node) || node.getChildrenSize() > 0) return null
        if (!$isRootNode(node.getParent())) return null
        return $getRoot().getChildrenSize() > 1 ? node.getKey() : null
      })
      const element = key === null ? null : editor.getElementByKey(key)
      if (element === marked) return
      unmark()
      element?.setAttribute(ATTRIBUTE, m.editor_line_placeholder())
      marked = element
    })
    return () => {
      unregister()
      unmark()
    }
  }, [editor])
  return null
}
