import {
  $applyNodeReplacement,
  type DOMConversionMap,
  type DOMConversionOutput,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedTextNode,
  TextNode
} from "lexical"
import {
  formatMentionHref,
  parseMentionHref,
  type MentionType
} from "@projectproject/shared"

export interface SerializedMentionNode extends SerializedTextNode {
  mentionType: MentionType
  mentionId: string
  mentionLabel: string
}

export class MentionNode extends TextNode {
  __mentionType: MentionType
  __mentionId: string
  __mentionLabel: string

  static getType(): string {
    return "mention"
  }

  static clone(node: MentionNode): MentionNode {
    return new MentionNode(
      node.__mentionType,
      node.__mentionId,
      node.__mentionLabel,
      node.__key
    )
  }

  constructor(type: MentionType, id: string, label: string, key?: NodeKey) {
    super(displayText(type, id, label), key)
    this.__mentionType = type
    this.__mentionId = id
    this.__mentionLabel = label
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config)
    dom.classList.add("mention-chip", `mention-${this.__mentionType}`)
    dom.setAttribute("data-mention-type", this.__mentionType)
    dom.setAttribute("data-mention-id", this.__mentionId)
    return dom
  }

  isTextEntity(): true {
    return true
  }

  canInsertTextBefore(): boolean {
    return false
  }

  canInsertTextAfter(): boolean {
    return false
  }

  exportDOM(): DOMExportOutput {
    const a = document.createElement("a")
    a.href = formatMentionHref(this.__mentionType, this.__mentionId)
    a.textContent = this.__mentionLabel
    return { element: a }
  }

  static importDOM(): DOMConversionMap | null {
    return {
      a: (node: HTMLElement) => {
        const href = node.getAttribute("href")
        const parsed = href ? parseMentionHref(href) : null
        if (!parsed) return null
        return {
          conversion: (el): DOMConversionOutput => ({
            node: $createMentionNode(
              parsed.type,
              parsed.id,
              el.textContent ?? parsed.id
            )
          }),
          priority: 1
        }
      }
    }
  }

  exportJSON(): SerializedMentionNode {
    return {
      ...super.exportJSON(),
      type: "mention",
      version: 1,
      mentionType: this.__mentionType,
      mentionId: this.__mentionId,
      mentionLabel: this.__mentionLabel
    }
  }

  static importJSON(serialized: SerializedMentionNode): MentionNode {
    const node = $createMentionNode(
      serialized.mentionType,
      serialized.mentionId,
      serialized.mentionLabel
    )
    node.setFormat(serialized.format)
    node.setDetail(serialized.detail)
    node.setMode(serialized.mode)
    node.setStyle(serialized.style)
    return node
  }
}

const displayText = (type: MentionType, id: string, label: string) => {
  switch (type) {
    case "user":
      return `@${label}`
    case "ticket":
      return id
  }
}

export function $createMentionNode(
  type: MentionType,
  id: string,
  label: string
): MentionNode {
  return $applyNodeReplacement(new MentionNode(type, id, label))
}

export function $isMentionNode(
  node: LexicalNode | null | undefined
): node is MentionNode {
  return node instanceof MentionNode
}
