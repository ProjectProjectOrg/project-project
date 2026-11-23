import { $isCodeNode } from "@lexical/code-core"
import {
  $applyNodeReplacement,
  TextNode,
  type EditorConfig,
  type LexicalNode,
  type SerializedTextNode
} from "lexical"

export class HintNode extends TextNode {
  static getType() {
    return "block-hint"
  }

  static clone(node: HintNode) {
    return new HintNode(node.__text, node.__key)
  }

  static importJSON(serialized: SerializedTextNode) {
    return $createHintNode(serialized.text).updateFromJSON(serialized)
  }

  createDOM(config: EditorConfig) {
    const element = super.createDOM(config)
    element.classList.add("lexical-hint")
    return element
  }

  canInsertTextBefore() {
    return false
  }

  canInsertTextAfter() {
    return false
  }
}

export function $createHintNode(text: string) {
  return $applyNodeReplacement(new HintNode(text))
}

export function $isHintNode(
  node: LexicalNode | null | undefined
): node is HintNode {
  return node instanceof HintNode
}

const TRAILING_HINT = /\{\{[^{}\n]{1,200}\}\}(?=\s*$)/

export function $convertTrailingHint(node: TextNode) {
  if (node.hasFormat("code") || $isCodeNode(node.getParent())) return
  const match = TRAILING_HINT.exec(node.getTextContent())
  if (match === null) return
  const parts = node.splitText(match.index, match.index + match[0].length)
  parts[match.index === 0 ? 0 : 1]?.replace($createHintNode(match[0]))
}
