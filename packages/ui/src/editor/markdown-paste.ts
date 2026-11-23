import { $insertGeneratedNodes } from "@lexical/clipboard"
import { $isCodeNode } from "@lexical/code-core"
import { $generateNodesFromMarkdownString } from "@lexical/mdast"
import {
  $addUpdateTag,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_NORMAL,
  PASTE_COMMAND,
  PASTE_TAG,
  type LexicalEditor
} from "lexical"

export function registerMarkdownPaste(editor: LexicalEditor) {
  return editor.registerCommand(
    PASTE_COMMAND,
    (event) => {
      if (!(event instanceof ClipboardEvent)) return false
      const data = event.clipboardData
      if (!data) return false
      const text = data.getData("text/plain")
      if (
        !text ||
        data.files.length > 0 ||
        data.getData("text/html") ||
        data.getData("application/x-lexical-editor")
      )
        return false

      const selection = $getSelection()
      if (!$isRangeSelection(selection)) return false
      const anchor = selection.anchor.getNode()
      if ([anchor, ...anchor.getParents()].some($isCodeNode)) return false

      $insertGeneratedNodes(
        editor,
        $generateNodesFromMarkdownString(text),
        selection
      )
      $addUpdateTag(PASTE_TAG)
      event.preventDefault()
      return true
    },
    COMMAND_PRIORITY_NORMAL
  )
}
