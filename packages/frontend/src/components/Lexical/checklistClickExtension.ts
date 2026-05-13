// Bypass @lexical/list's click handler: it stamps a 500ms per-LI dedup
// timestamp before its bounds check, so a click just outside the checkbox
// silently swallows the next one. We intercept in capture phase with a
// wider hit zone and toggle directly.
import {
  $getNearestNodeFromDOMNode,
  defineExtension,
  type LexicalEditor
} from "lexical"
import { $isListItemNode, CheckListExtension } from "@lexical/list"

const CHECKBOX_ZONE_EM = 1.75

function isCheckboxClick(event: MouseEvent | PointerEvent): HTMLLIElement | null {
  const target = event.target
  if (!(target instanceof HTMLLIElement)) return null
  if (
    !target.classList.contains("lexical-li-unchecked") &&
    !target.classList.contains("lexical-li-checked")
  ) {
    return null
  }
  const rect = target.getBoundingClientRect()
  const offsetX = event.clientX - rect.left
  const fontSize = parseFloat(getComputedStyle(target).fontSize)
  return offsetX <= fontSize * CHECKBOX_ZONE_EM ? target : null
}

export const ChecklistClickExtension = defineExtension({
  name: "@projectproject/checklist-click",
  dependencies: [CheckListExtension],
  register: (editor: LexicalEditor) => {
    return editor.registerRootListener((rootElement) => {
      if (rootElement === null) return
      const onPointerDown = (event: PointerEvent) => {
        if (isCheckboxClick(event) === null) return
        event.preventDefault()
        event.stopPropagation()
      }
      const onClick = (event: MouseEvent) => {
        const li = isCheckboxClick(event)
        if (li === null) return
        event.preventDefault()
        event.stopPropagation()
        editor.update(() => {
          const node = $getNearestNodeFromDOMNode(li)
          if ($isListItemNode(node)) node.toggleChecked()
        })
      }
      rootElement.addEventListener("pointerdown", onPointerDown, true)
      rootElement.addEventListener("click", onClick, true)
      return () => {
        rootElement.removeEventListener("pointerdown", onPointerDown, true)
        rootElement.removeEventListener("click", onClick, true)
      }
    })
  }
})
