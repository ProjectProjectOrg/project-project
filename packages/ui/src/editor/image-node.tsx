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

import { ATTACHMENT_IMAGE_CLASS } from "./attachment-image-style"

type ImagePayload = Readonly<Pick<Image, "url" | "alt" | "title">>
type SerializedImageNode = Readonly<Spread<ImagePayload, SerializedLexicalNode>>

export class ImageNode extends DecoratorNode<ReactElement> {
  __image: ImagePayload

  static getType() {
    return "markdown-image"
  }

  static clone(node: ImageNode) {
    return new ImageNode(node.__image, node.__key)
  }

  static importJSON(serialized: SerializedImageNode) {
    const { url, alt, title } = serialized
    return $createImageNode({ url, alt, title })
  }

  constructor(image: ImagePayload, key?: NodeKey) {
    super(key)
    this.__image = image
  }

  getImage() {
    return this.getLatest().__image
  }

  exportJSON() {
    return { ...super.exportJSON(), ...this.__image }
  }

  exportDOM() {
    const { url, alt, title } = this.getImage()
    const element = document.createElement("img")
    element.setAttribute("src", defaultUrlTransform(url))
    element.setAttribute("alt", alt ?? "")
    if (title != null) element.setAttribute("title", title)
    return { element } satisfies DOMExportOutput
  }

  createDOM() {
    const element = document.createElement("span")
    element.className = "inline-block align-top"
    return element
  }

  updateDOM() {
    return false
  }

  isInline() {
    return true
  }

  decorate() {
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

export function $createImageNode(image: ImagePayload) {
  return $applyNodeReplacement(new ImageNode(image))
}
