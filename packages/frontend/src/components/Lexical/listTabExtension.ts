import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  INDENT_CONTENT_COMMAND,
  KEY_TAB_COMMAND,
  OUTDENT_CONTENT_COMMAND,
  defineExtension,
  type LexicalEditor
} from "lexical"
import { $getNearestBlockElementAncestorOrThrow } from "@lexical/utils"
import { $isListItemNode, ListExtension } from "@lexical/list"

export const ListTabExtension = defineExtension({
  name: "@projectproject/list-tab",
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
        editor.dispatchCommand(
          event.shiftKey ? OUTDENT_CONTENT_COMMAND : INDENT_CONTENT_COMMAND,
          undefined
        )
        return true
      },
      COMMAND_PRIORITY_HIGH
    )
})
