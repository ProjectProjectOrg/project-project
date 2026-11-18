import type { TextMatchTransformer } from "@lexical/markdown"
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

export const HINT_TRANSFORMER: TextMatchTransformer = {
  dependencies: [HintNode],
  export: (node) => ($isHintNode(node) ? node.getTextContent() : null),
  importRegExp: /\{\{[^{}\n]{1,200}\}\}(?=\s*$)/,
  regExp: /\{\{[^{}\n]{1,200}\}\}$/,
  replace: (textNode, match) => {
    textNode.replace($createHintNode(match[0]))
  },
  trigger: "}",
  type: "text-match"
}
