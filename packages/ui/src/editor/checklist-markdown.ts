import {
  $createListNode,
  $isListItemNode,
  $isListNode,
  CheckListExtension,
  type ListItemNode
} from "@lexical/list"
import { CHECK_LIST, type ElementTransformer } from "@lexical/markdown"
import {
  $copyNode,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COLLABORATION_TAG,
  HISTORIC_TAG,
  defineExtension,
  type ElementNode,
  type LexicalEditor,
  type LexicalNode
} from "lexical"

const TASK_MARKER = /^\[[ xX]?\](?=\s|$)/

const TYPED_TASK_MARKER = /^\[([ xX])?\]\s$/

const escapeTaskMarker =
  (exportChildren: (node: ElementNode) => string) =>
  (node: ElementNode): string => {
    const text = exportChildren(node)
    const list = node.getParent()
    return $isListItemNode(node) &&
      $isListNode(list) &&
      list.getListType() !== "check" &&
      TASK_MARKER.test(text)
      ? `\\${text}`
      : text
  }

export const ESCAPED_CHECK_LIST: ElementTransformer = {
  ...CHECK_LIST,
  export: (node, exportChildren) =>
    CHECK_LIST.export(node, escapeTaskMarker(exportChildren))
}

const $isNestedListHolder = (node: LexicalNode | null): node is ListItemNode =>
  $isListItemNode(node) &&
  !node.isEmpty() &&
  node.getChildren().every($isListNode)

const $nestedListsOf = (item: ListItemNode): ReadonlyArray<ListItemNode> => {
  const holders: Array<ListItemNode> = []
  let next = item.getNextSibling()
  while ($isNestedListHolder(next)) {
    holders.push(next)
    next = next.getNextSibling()
  }
  return holders
}

export function $convertToChecklistItem(item: ListItemNode, checked: boolean) {
  const list = item.getParent()
  if (!$isListNode(list)) return
  const nested = $nestedListsOf(item)
  const after = item.getNextSiblings().slice(nested.length)
  if (after.length > 0) {
    const rest = $copyNode(list)
    rest.append(...after)
    list.insertAfter(rest)
  }
  const previous = list.getPreviousSibling()
  const target =
    item.getPreviousSibling() === null &&
    $isListNode(previous) &&
    previous.getListType() === "check"
      ? previous
      : $createListNode("check")
  if (target !== previous) list.insertAfter(target)
  target.append(item, ...nested)
  item.setChecked(checked)
  if (list.isEmpty()) list.remove()
}

function $applyTypedTaskMarker(key: string, offset: number): boolean {
  const text = $getNodeByKey(key)
  if (!$isTextNode(text) || text.hasFormat("code")) return false
  const item = text.getParent()
  const list = item?.getParent()
  if (
    !$isListItemNode(item) ||
    !$isListNode(list) ||
    list.getListType() !== "bullet" ||
    item.getFirstChild() !== text
  )
    return false
  const match = TYPED_TASK_MARKER.exec(text.getTextContent().slice(0, offset))
  if (match === null) return false
  const rest = text.getTextContent().slice(offset)
  $convertToChecklistItem(item, match[1] === "x" || match[1] === "X")
  if (rest === "") {
    text.remove()
    item.select(0, 0)
  } else {
    text.setTextContent(rest)
    text.select(0, 0)
  }
  return true
}

export function registerChecklistShortcut(editor: LexicalEditor): () => void {
  return editor.registerUpdateListener(
    ({ tags, dirtyLeaves, editorState, prevEditorState }) => {
      if (tags.has(COLLABORATION_TAG) || tags.has(HISTORIC_TAG)) return
      if (editor.isComposing()) return
      const selection = editorState.read($getSelection)
      const previous = prevEditorState.read($getSelection)
      if (
        !$isRangeSelection(selection) ||
        !$isRangeSelection(previous) ||
        !selection.isCollapsed() ||
        selection.anchor.type !== "text"
      )
        return
      const { key, offset } = selection.anchor
      if (!dirtyLeaves.has(key)) return
      if (previous.anchor.key === key && previous.anchor.offset !== offset - 1)
        return
      editor.update(() => {
        $applyTypedTaskMarker(key, offset)
      })
    }
  )
}

export const ChecklistShortcutExtension = defineExtension({
  name: "@pp/checklist-shortcut",
  dependencies: [CheckListExtension],
  register: registerChecklistShortcut
})
