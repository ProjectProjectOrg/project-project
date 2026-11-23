import {
  $createCodeHighlightNode,
  $isCodeHighlightNode,
  $isCodeNode,
  $plainifyCodeContent,
  CodeExtension,
  CodeHighlightNode,
  CodeIndentExtension,
  CodeNode,
  registerCodeGutter
} from "@lexical/code-core"
import {
  $createLineBreakNode,
  $createTabNode,
  $createTextNode,
  $getEditor,
  $getNodeByKey,
  $getSelection,
  $isLineBreakNode,
  $isRangeSelection,
  $isTabNode,
  $isTextNode,
  $onUpdate,
  defineExtension,
  mergeRegister,
  TextNode,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey
} from "lexical"

import { highlightCode, isHighlighted } from "../lib/highlight"

export const PLAIN_CODE_LANGUAGE = "plain"

type Highlighting = { pending: boolean; keys: Set<NodeKey> }

const $highlightNodes = (text: string, language: string) => {
  const lines = highlightCode(text, language)
  if (lines === null) return $plainifyCodeContent(text)
  return lines.flatMap((line, index) => {
    const nodes: Array<LexicalNode> = index > 0 ? [$createLineBreakNode()] : []
    for (const { text: part, kind } of line)
      for (const piece of part.split(/(\t)/)) {
        if (piece === "\t") nodes.push($createTabNode())
        else if (piece !== "")
          nodes.push($createCodeHighlightNode(piece, kind ?? undefined))
      }
    return nodes
  })
}

const sameNode = (a: LexicalNode, b: LexicalNode | undefined) =>
  ($isCodeHighlightNode(a) &&
    $isCodeHighlightNode(b) &&
    a.__text === b.__text &&
    a.__highlightType === b.__highlightType) ||
  ($isTabNode(a) && $isTabNode(b)) ||
  ($isLineBreakNode(a) && $isLineBreakNode(b))

const changedRange = (
  previous: Array<LexicalNode>,
  next: Array<LexicalNode>
) => {
  let leading = 0
  while (
    leading < previous.length &&
    sameNode(previous[leading], next[leading])
  )
    leading++
  const room = Math.min(previous.length, next.length) - leading
  let trailing = 0
  while (
    trailing < room &&
    sameNode(
      previous[previous.length - 1 - trailing],
      next[next.length - 1 - trailing]
    )
  )
    trailing++
  return {
    from: leading,
    to: previous.length - trailing,
    nodes: next.slice(leading, next.length - trailing)
  }
}

const $caretOffset = (code: CodeNode) => {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return null
  const { anchor } = selection
  const node = anchor.getNode()
  if (node !== code && !code.isParentOf(node)) return null
  const before =
    node === code
      ? code.getChildren().slice(0, anchor.offset)
      : node.getPreviousSiblings()
  const size = before.reduce(
    (total, sibling) => total + sibling.getTextContentSize(),
    0
  )
  return node === code ? size : size + anchor.offset
}

const $restoreCaret = (code: CodeNode, caret: number) => {
  let offset = caret
  const children = code.getChildren()
  for (const [index, child] of children.entries()) {
    if ($isTextNode(child)) {
      const size = child.getTextContentSize()
      if (size >= offset) {
        child.select(offset, offset)
        return
      }
      offset -= size
    } else if ($isLineBreakNode(child)) {
      if (offset === 0) {
        code.select(index, index)
        return
      }
      offset -= 1
    }
  }
  code.select(children.length, children.length)
}

const $highlight = (state: Highlighting, code: CodeNode) => {
  const key = code.getKey()
  if (!code.getLanguage()) code.setLanguage(PLAIN_CODE_LANGUAGE)
  const language = code.getLanguage() ?? PLAIN_CODE_LANGUAGE
  const supported = isHighlighted(language)
  if (code.getIsSyntaxHighlightSupported() !== supported)
    code.setIsSyntaxHighlightSupported(supported)
  if (state.keys.has(key) || $getEditor().isComposing()) return
  state.keys.add(key)
  if (!state.pending) {
    state.pending = true
    $onUpdate(() => {
      state.pending = false
      state.keys.clear()
    })
  }
  const current = $getNodeByKey(key)
  if (!$isCodeNode(current) || !current.isAttached()) return
  const caret = $caretOffset(current)
  const { from, to, nodes } = changedRange(
    current.getChildren(),
    $highlightNodes(current.getTextContent(), language)
  )
  if (from === to && nodes.length === 0) return
  current.splice(from, to - from, nodes)
  if (caret !== null) $restoreCaret(current, caret)
}

const $highlightText = (state: Highlighting, node: TextNode) => {
  const parent = node.getParent()
  if ($isCodeNode(parent)) $highlight(state, parent)
  else if ($isCodeHighlightNode(node))
    node.replace($createTextNode(node.__text))
}

export const registerCodeHighlighting = (editor: LexicalEditor) => {
  const state: Highlighting = { pending: false, keys: new Set() }
  return mergeRegister(
    registerCodeGutter(editor),
    editor.registerNodeTransform(CodeNode, (node) => $highlight(state, node)),
    editor.registerNodeTransform(TextNode, (node) =>
      $highlightText(state, node)
    ),
    editor.registerNodeTransform(CodeHighlightNode, (node) =>
      $highlightText(state, node)
    )
  )
}

export const CodeHighlightExtension = defineExtension({
  name: "@pp/code-highlight",
  dependencies: [CodeExtension, CodeIndentExtension],
  register: registerCodeHighlighting
})
