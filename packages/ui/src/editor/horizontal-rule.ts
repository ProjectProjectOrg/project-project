import {
  $createHorizontalRuleNode,
  HorizontalRuleExtension
} from "@lexical/extension"
import { mergeRegister } from "@lexical/utils"
import {
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  KEY_ENTER_COMMAND,
  KEY_SPACE_COMMAND,
  defineExtension,
  type LexicalEditor
} from "lexical"

const HR_LINE = /^(---|\*\*\*|___)$/

function $replaceRuleLine(event: KeyboardEvent | null) {
  if (event !== null && event.shiftKey) return false
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false
  const anchorNode = selection.anchor.getNode()
  if (!$isTextNode(anchorNode)) return false
  const parent = anchorNode.getParent()
  if (!$isParagraphNode(parent) || parent.getFirstChild() !== anchorNode)
    return false
  const text = anchorNode.getTextContent()
  if (selection.anchor.offset !== text.length) return false
  if (!HR_LINE.test(text)) return false
  event?.preventDefault()
  const line = $createHorizontalRuleNode()
  if (parent.getNextSibling() != null) {
    parent.replace(line)
  } else {
    parent.insertBefore(line)
    anchorNode.remove()
  }
  line.selectNext()
  return true
}

export const HorizontalRuleShortcutExtension = defineExtension({
  name: "@pp/horizontal-rule-shortcut",
  dependencies: [HorizontalRuleExtension],
  register: (editor: LexicalEditor) =>
    mergeRegister(
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        $replaceRuleLine,
        COMMAND_PRIORITY_HIGH
      ),
      editor.registerCommand(
        KEY_SPACE_COMMAND,
        $replaceRuleLine,
        COMMAND_PRIORITY_HIGH
      )
    )
})
