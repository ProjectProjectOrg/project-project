import {
  $applyNodeReplacement,
  ElementNode,
  type LexicalNode,
  type NodeKey,
  type SerializedElementNode,
  type Spread
} from "lexical"

export type SerializedTicketBlockNode = Spread<
  { blockType: string },
  SerializedElementNode
>

export class TicketBlockNode extends ElementNode {
  __blockType: string

  static getType(): string {
    return "ticket-block"
  }

  static clone(node: TicketBlockNode): TicketBlockNode {
    return new TicketBlockNode(node.__blockType, node.__key)
  }

  static importJSON(serialized: SerializedTicketBlockNode): TicketBlockNode {
    return $createTicketBlockNode(serialized.blockType).updateFromJSON(
      serialized
    )
  }

  constructor(blockType: string, key?: NodeKey) {
    super(key)
    this.__blockType = blockType
  }

  exportJSON(): SerializedTicketBlockNode {
    return { ...super.exportJSON(), blockType: this.__blockType }
  }

  getBlockType(): string {
    return this.getLatest().__blockType
  }

  createDOM(): HTMLElement {
    const element = document.createElement("div")
    element.className = "ticket-block"
    element.dataset.blockType = this.__blockType
    return element
  }

  updateDOM(previous: TicketBlockNode): boolean {
    return previous.__blockType !== this.__blockType
  }

  isShadowRoot(): boolean {
    return true
  }

  canBeEmpty(): boolean {
    return false
  }

  canIndent(): boolean {
    return false
  }
}

export function $createTicketBlockNode(blockType: string): TicketBlockNode {
  return $applyNodeReplacement(new TicketBlockNode(blockType))
}

export function $isTicketBlockNode(
  node: LexicalNode | null | undefined
): node is TicketBlockNode {
  return node instanceof TicketBlockNode
}
