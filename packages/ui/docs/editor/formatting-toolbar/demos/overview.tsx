import { LexicalEditor } from "@pp/ui/editor/lexical-editor"
import {
  $getRoot,
  $isElementNode,
  $isTextNode,
  type LexicalEditor as LexicalEditorType
} from "lexical"
import { useEffect, useRef } from "react"

import { EditorKit } from "../../kit"

const TEXT = `Select any text and the **formatting toolbar** appears over it: bold, italic, strikethrough, inline code, a link, and six block types.

- Pressed block types turn back into a paragraph
- Alt+F10 moves focus into the toolbar`

const WORD = "formatting toolbar"

// Starts with two words selected, so the toolbar is open.
export default function FormattingToolbarOverview() {
  const editorRef = useRef<LexicalEditorType | null>(null)
  useEffect(() => {
    const editor = editorRef.current
    if (editor === null) return
    editor.focus(() =>
      editor.update(() => {
        const first = $getRoot().getFirstChild()
        if (!$isElementNode(first)) return
        for (const node of first.getChildren()) {
          if (!$isTextNode(node)) continue
          const at = node.getTextContent().indexOf(WORD)
          if (at === -1) continue
          node.select(at, at + WORD.length)
          return
        }
      })
    )
  }, [])
  return (
    <EditorKit>
      <div className="w-full max-w-2xl self-start rounded-[18px] surface-card px-6 pt-16 pb-6 corner-squircle">
        <LexicalEditor markdown={TEXT} editorRef={editorRef} />
      </div>
    </EditorKit>
  )
}
