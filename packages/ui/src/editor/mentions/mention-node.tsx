import {
  formatMentionHref,
  parseMentionHref,
  parseTicketMentionId,
  type MentionType
} from "@pp/shared"
import {
  $applyNodeReplacement,
  DecoratorNode,
  type DOMConversionMap,
  type DOMExportOutput,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread
} from "lexical"
import type { ReactElement } from "react"

import { MentionChip } from "./mention-chip"

export type SerializedMentionNode = Spread<
  {
    mentionType: MentionType
    mentionId: string
    mentionLabel: string
  },
  SerializedLexicalNode
>

export class MentionNode extends DecoratorNode<ReactElement> {
  __mentionType: MentionType
  __mentionId: string
  __mentionLabel: string

  static getType() {
    return "mention"
  }

  static clone(node: MentionNode) {
    return new MentionNode(
      node.__mentionType,
      node.__mentionId,
      node.__mentionLabel,
      node.__key
    )
  }

  constructor(type: MentionType, id: string, label: string, key?: NodeKey) {
    super(key)
    this.__mentionType = type
    this.__mentionId = id
    this.__mentionLabel = label
  }

  createDOM() {
    const span = document.createElement("span")
    span.setAttribute("data-mention-type", this.__mentionType)
    span.setAttribute("data-mention-id", this.__mentionId)
    span.style.display = "inline"
    return span
  }

  updateDOM() {
    return false
  }

  isInline() {
    return true
  }

  isKeyboardSelectable() {
    return false
  }

  getTextContent() {
    return this.__mentionType === "ticket"
      ? parseTicketMentionId(this.__mentionId).ticketId
      : this.__mentionType === "user"
        ? `@${this.__mentionLabel}`
        : this.__mentionLabel
  }

  exportDOM() {
    const a = document.createElement("a")
    a.href = formatMentionHref(this.__mentionType, this.__mentionId)
    a.textContent = this.__mentionLabel
    return { element: a } satisfies DOMExportOutput
  }

  static importDOM() {
    return {
      a: (node: HTMLElement) => {
        const href = node.getAttribute("href")
        const parsed = href ? parseMentionHref(href) : null
        if (!parsed) return null
        return {
          conversion: (el) => ({
            node: $createMentionNode(
              parsed.type,
              parsed.id,
              el.textContent ?? parsed.id
            )
          }),
          priority: 1
        }
      }
    } satisfies DOMConversionMap
  }

  exportJSON() {
    return {
      ...super.exportJSON(),
      type: "mention",
      version: 1,
      mentionType: this.__mentionType,
      mentionId: this.__mentionId,
      mentionLabel: this.__mentionLabel
    } satisfies SerializedMentionNode
  }

  static importJSON(serialized: SerializedMentionNode) {
    return $createMentionNode(
      serialized.mentionType,
      serialized.mentionId,
      serialized.mentionLabel
    )
  }

  decorate() {
    return (
      <MentionChip
        type={this.__mentionType}
        id={this.__mentionId}
        label={this.__mentionLabel}
      />
    )
  }
}

export function $createMentionNode(
  type: MentionType,
  id: string,
  label: string
) {
  return $applyNodeReplacement(new MentionNode(type, id, label))
}

export function $isMentionNode(
  node: LexicalNode | null | undefined
): node is MentionNode {
  return node instanceof MentionNode
}

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    import.meta.hot!.invalidate()
  })
}
