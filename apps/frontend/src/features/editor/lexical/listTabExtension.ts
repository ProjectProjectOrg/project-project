import { $isListItemNode, ListExtension } from "@lexical/list"
import { $getNearestBlockElementAncestorOrThrow } from "@lexical/utils"
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  INDENT_CONTENT_COMMAND,
  KEY_TAB_COMMAND,
  OUTDENT_CONTENT_COMMAND,
  defineExtension,
  type LexicalEditor
} from "lexical"

const MAX_LIST_INDENT = 4

export const ListTabExtension = defineExtension({
  name: "@pp/list-tab",
  dependencies: [ListExtension],
  register: (editor: LexicalEditor) =>
    editor.registerCommand(
      KEY_TAB_COMMAND,
      (event) => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) return false
        const block = $getNearestBlockElementAncestorOrThrow(
          selection.anchor.getNode()
        )
        if (!$isListItemNode(block)) return false
        event.preventDefault()
        if (!event.shiftKey && block.getIndent() + 1 >= MAX_LIST_INDENT)
          return true
        editor.dispatchCommand(
          event.shiftKey ? OUTDENT_CONTENT_COMMAND : INDENT_CONTENT_COMMAND,
          undefined
        )
        return true
      },
      COMMAND_PRIORITY_LOW
    )
})
