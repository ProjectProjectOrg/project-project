import { $isListNode, ListItemNode, ListNode } from "@lexical/list"
import {
  $getNodeByKey,
  defineExtension,
  setDOMUnmanaged,
  type EditorConfig,
  type ElementDOMSlot,
  type LexicalEditor
} from "lexical"

import {
  CHECK_PATH,
  checkboxCheckClass,
  checkboxClass,
  checkboxFillClass
} from "../components/checkbox"

/*
 * Checklist items draw the Checkbox component's own box (its markup and
 * classes, so the look, the fill's spring and the drawn-on check all match)
 * instead of Lexical's CSS pseudo-element. The box is DOM the item owns,
 * outside its text (getDOMSlot keeps Lexical's children before it); the
 * item itself stays the accessible checkbox (role, aria-checked).
 */

const SVG = "http://www.w3.org/2000/svg"

function createBox(): HTMLSpanElement {
  const box = document.createElement("span")
  box.dataset.slot = "checkbox"
  box.className = checkboxClass()
  box.contentEditable = "false"
  box.setAttribute("aria-hidden", "true")
  const fill = document.createElement("span")
  fill.className = checkboxFillClass
  const svg = document.createElementNS(SVG, "svg")
  svg.setAttribute("viewBox", "0 0 16 16")
  svg.setAttribute("class", "relative size-full overflow-visible")
  const check = document.createElementNS(SVG, "path")
  check.setAttribute("pathLength", "1")
  check.setAttribute("d", CHECK_PATH)
  check.setAttribute("class", checkboxCheckClass)
  svg.append(check)
  box.append(fill, svg)
  setDOMUnmanaged(box)
  return box
}

const boxOf = (dom: HTMLElement): HTMLElement | null =>
  dom.lastElementChild instanceof HTMLElement &&
  dom.lastElementChild.dataset.slot === "checkbox"
    ? dom.lastElementChild
    : null

// Shows the box on a checklist leaf (the item ListItemNode gives the
// checkbox role) and mirrors its checked state.
function syncBox(dom: HTMLElement) {
  const box = boxOf(dom)
  if (box === null) return
  box.hidden = dom.getAttribute("role") !== "checkbox"
  box.toggleAttribute(
    "data-checked",
    dom.getAttribute("aria-checked") === "true"
  )
}

export class ChecklistItemNode extends ListItemNode {
  $config() {
    return this.config("pp-listitem", { extends: ListItemNode })
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config)
    dom.append(createBox())
    syncBox(dom)
    return dom
  }

  updateDOM(prevNode: ListItemNode, dom: HTMLElement, config: EditorConfig) {
    const replace = super.updateDOM(prevNode, dom, config)
    syncBox(dom)
    return replace
  }

  getDOMSlot(dom: HTMLElement): ElementDOMSlot {
    const slot = super.getDOMSlot(dom)
    const box = boxOf(dom)
    return box === null ? slot : slot.withBefore(box)
  }
}

// A checklist's <ul> holds checkboxes, not list items (ListItemNode gives
// each item the checkbox role), so it's a group of them.
function syncListRole(editor: LexicalEditor, key: string) {
  editor.getEditorState().read(() => {
    const dom = editor.getElementByKey(key)
    if (dom === null) return
    const node = $getNodeByKey(key)
    if ($isListNode(node) && node.getListType() === "check")
      dom.setAttribute("role", "group")
    else dom.removeAttribute("role")
  })
}

export const ChecklistItemExtension = defineExtension({
  name: "@pp/checklist-item",
  nodes: [
    ChecklistItemNode,
    {
      replace: ListItemNode,
      // The raw fields: getChecked() is undefined until the item has a
      // checklist parent, which a new item doesn't yet.
      with: (node: ListItemNode) =>
        new ChecklistItemNode(node.__value, node.__checked),
      withKlass: ChecklistItemNode
    }
  ],
  register: (editor: LexicalEditor) =>
    editor.registerMutationListener(ListNode, (mutations) => {
      for (const [key, mutation] of mutations)
        if (mutation !== "destroyed") syncListRole(editor, key)
    })
})
