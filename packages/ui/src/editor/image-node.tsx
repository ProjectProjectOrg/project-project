import {
  $applyNodeReplacement,
  DecoratorNode,
  type DOMExportOutput,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread
} from "lexical"
import type { Image } from "mdast"
import type { ReactElement } from "react"
import { defaultUrlTransform } from "react-markdown"

import { ATTACHMENT_IMAGE_CLASS } from "./attachmentImageStyle"

type ImagePayload = Readonly<Pick<Image, "url" | "alt" | "title">>
type SerializedImageNode = Readonly<Spread<ImagePayload, SerializedLexicalNode>>

export class ImageNode extends DecoratorNode<ReactElement> {
  __image: ImagePayload

  static getType(): string {
    return "markdown-image"
  }

  static clone(node: ImageNode): ImageNode {
    return new ImageNode(node.__image, node.__key)
  }

  static importJSON(serialized: SerializedImageNode): ImageNode {
    const { url, alt, title } = serialized
    return $createImageNode({ url, alt, title })
  }

  constructor(image: ImagePayload, key?: NodeKey) {
    super(key)
    this.__image = image
  }

  getImage(): ImagePayload {
    return this.getLatest().__image
  }

  exportJSON(): SerializedImageNode {
    return { ...super.exportJSON(), ...this.__image }
  }

  exportDOM(): DOMExportOutput {
    const { url, alt, title } = this.getImage()
    const element = document.createElement("img")
    element.setAttribute("src", defaultUrlTransform(url))
    element.setAttribute("alt", alt ?? "")
    if (title != null) element.setAttribute("title", title)
    return { element }
  }

  createDOM(): HTMLElement {
    const element = document.createElement("span")
    element.className = "inline-block align-top"
    return element
  }

  updateDOM(): false {
    return false
  }

  isInline(): true {
    return true
  }

  decorate(): ReactElement {
    const { url, alt, title } = this.__image
    return (
      <img
        src={defaultUrlTransform(url)}
        alt={alt ?? ""}
        title={title ?? undefined}
        className={ATTACHMENT_IMAGE_CLASS}
        loading="lazy"
        decoding="async"
      />
    )
  }
}

export function $createImageNode(image: ImagePayload): ImageNode {
  return $applyNodeReplacement(new ImageNode(image))
}
