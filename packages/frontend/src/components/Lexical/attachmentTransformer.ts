import type { ElementTransformer } from "@lexical/markdown"
import {
  attachmentWidthFromUrl,
  parseAttachmentUrl,
  withAttachmentWidth
} from "@projectproject/shared"
import {
  $createAttachmentNode,
  $isAttachmentNode,
  AttachmentNode
} from "./AttachmentNode"

export const ATTACHMENT_MARKDOWN_RE =
  /^(!?)\[((?:\\.|[^\]\\])*)\]\((\/api\/attachments\/[^)\s]+)\)\s*$/

export const formatAttachmentMarkdown = (input: {
  readonly kind: "image" | "file"
  readonly alt: string
  readonly url: string
  readonly width?: number | null
}): string => {
  const alt = input.alt.replace(/([[\]\\])/g, "\\$1")
  const url = withAttachmentWidth(input.url, input.width ?? null)
  return `${input.kind === "image" ? "!" : ""}[${alt}](${url})`
}

export const unescapeAttachmentAlt = (alt: string): string =>
  alt.replace(/\\(.)/g, "$1")

export const ATTACHMENT_TRANSFORMER: ElementTransformer = {
  dependencies: [AttachmentNode],
  export: (node) => {
    if (!$isAttachmentNode(node)) return null
    if (node.getUploadId() !== undefined || node.getFailed()) return ""
    return formatAttachmentMarkdown({
      kind: node.getKind(),
      alt: node.getAlt(),
      url: node.getUrl(),
      width: node.getWidth()
    })
  },
  regExp: ATTACHMENT_MARKDOWN_RE,
  replace: (parentNode, _children, match) => {
    const [, bang, rawAlt, url] = match
    if (!url || !parseAttachmentUrl(url)) return false
    const alt = unescapeAttachmentAlt(rawAlt ?? "")
    const node = $createAttachmentNode({
      url: withAttachmentWidth(url, null),
      alt,
      filename: alt,
      kind: bang === "!" ? "image" : "file",
      width: attachmentWidthFromUrl(url)
    })
    parentNode.replace(node)
    return true
  },
  type: "element"
}
