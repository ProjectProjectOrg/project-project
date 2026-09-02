import type { ElementTransformer } from "@lexical/markdown"
import { parseAttachmentUrl } from "@projectproject/shared"
import {
  $createAttachmentNode,
  $isAttachmentNode,
  AttachmentNode
} from "./AttachmentNode"

export const ATTACHMENT_MARKDOWN_RE =
  /^(!?)\[([^\]]*)\]\((\/api\/attachments\/[^)\s]+)\)\s*$/

export const formatAttachmentMarkdown = (input: {
  readonly kind: "image" | "file"
  readonly alt: string
  readonly url: string
}): string => {
  const alt = input.alt.replace(/([[\]])/g, "\\$1")
  return `${input.kind === "image" ? "!" : ""}[${alt}](${input.url})`
}

export const ATTACHMENT_TRANSFORMER: ElementTransformer = {
  dependencies: [AttachmentNode],
  export: (node) => {
    if (!$isAttachmentNode(node)) return null
    if (node.getUploadId() !== undefined || node.getFailed()) return ""
    return formatAttachmentMarkdown({
      kind: node.getKind(),
      alt: node.getAlt(),
      url: node.getUrl()
    })
  },
  regExp: ATTACHMENT_MARKDOWN_RE,
  replace: (parentNode, _children, match) => {
    const [, bang, alt, url] = match
    if (!url || !parseAttachmentUrl(url)) return false
    const node = $createAttachmentNode({
      url,
      alt: alt ?? "",
      filename: alt ?? "",
      kind: bang === "!" ? "image" : "file"
    })
    parentNode.replace(node)
    return true
  },
  type: "element"
}
