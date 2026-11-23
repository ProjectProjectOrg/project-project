import type { MdastExportHandler, MdastImportHandler } from "@lexical/mdast"
import {
  attachmentSrc,
  attachmentViewParams,
  parseAttachmentUrl,
  withAttachmentParams
} from "@pp/shared"
import type { Image, Link } from "mdast"

import { plainText } from "../markdown-extension"
import { $createAttachmentNode, $isAttachmentNode } from "./attachment-node"

export const ATTACHMENT_MARKDOWN_RE =
  /(!?)\[((?:\\.|[^\]\\])*)\]\((\/api\/attachments\/[^)\s]+)\)/

export const unescapeAttachmentAlt = (alt: string) =>
  alt.replace(/\\(.)/g, "$1")

export const $importAttachment: MdastImportHandler<Image | Link> = (
  node,
  context
) => {
  if (parseAttachmentUrl(node.url) === null) return context.next()
  const alt = node.type === "image" ? (node.alt ?? "") : plainText(node)
  return $createAttachmentNode({
    url: attachmentSrc(node.url),
    alt,
    filename: alt,
    kind: node.type === "image" ? "image" : "file",
    ...attachmentViewParams(node.url)
  })
}

export const $exportAttachment: MdastExportHandler = (node) => {
  if (!$isAttachmentNode(node)) return null
  if (node.getUploadId() !== undefined || node.getFailed()) return []
  const url = withAttachmentParams(node.getUrl(), {
    width: node.getWidth(),
    density: node.getDensity()
  })
  return node.getKind() === "image"
    ? { type: "image", url, alt: node.getAlt() }
    : { type: "link", url, children: [{ type: "text", value: node.getAlt() }] }
}
