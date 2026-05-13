import type { ElementTransformer } from "@lexical/markdown"
import {
  $createHorizontalRuleNode,
  $isHorizontalRuleNode,
  HorizontalRuleExtension,
  HorizontalRuleNode
} from "@lexical/extension"
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  KEY_ENTER_COMMAND,
  defineExtension,
  type LexicalEditor
} from "lexical"

const HR_LINE = /^(---|\*\*\*|___)$/

export const HORIZONTAL_RULE: ElementTransformer = {
  dependencies: [HorizontalRuleNode],
  export: (node) => ($isHorizontalRuleNode(node) ? "---" : null),
  regExp: /^(---|\*\*\*|___)\s?$/,
  replace: (parentNode, _children, _match, isImport) => {
    const line = $createHorizontalRuleNode()
    if (isImport || parentNode.getNextSibling() != null) {
      parentNode.replace(line)
    } else {
      parentNode.insertBefore(line)
    }
    line.selectNext()
  },
  type: "element"
}

export const HorizontalRuleEnterExtension = defineExtension({
  name: "@projectproject/horizontal-rule-enter",
  dependencies: [HorizontalRuleExtension],
  register: (editor: LexicalEditor) =>
    editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event) => {
        if (event !== null && event.shiftKey) return false
        const selection = $getSelection()
        if (!$isRangeSelection(selection) || !selection.isCollapsed())
          return false
        const anchorNode = selection.anchor.getNode()
        if (!$isTextNode(anchorNode)) return false
        const parent = anchorNode.getParent()
        if (parent === null || parent.getFirstChild() !== anchorNode)
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
      },
      COMMAND_PRIORITY_HIGH
    )
})
