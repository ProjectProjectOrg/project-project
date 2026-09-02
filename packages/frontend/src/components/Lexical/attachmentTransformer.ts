import type { TextMatchTransformer } from "@lexical/markdown"
import { $createTextNode } from "lexical"
import {
  attachmentSrc,
  attachmentViewParams,
  parseAttachmentUrl,
  withAttachmentParams,
  type AttachmentDensity
} from "@projectproject/shared"
import {
  $createAttachmentNode,
  $isAttachmentNode,
  AttachmentNode
} from "./AttachmentNode"

export const ATTACHMENT_MARKDOWN_RE =
  /(!?)\[((?:\\.|[^\]\\])*)\]\((\/api\/attachments\/[^)\s]+)\)/

export const formatAttachmentMarkdown = (input: {
  readonly kind: "image" | "file"
  readonly alt: string
  readonly url: string
  readonly width?: number | null
  readonly density?: AttachmentDensity
}): string => {
  const alt = input.alt.replace(/([[\]\\])/g, "\\$1")
  const url = withAttachmentParams(input.url, {
    width: input.width,
    density: input.density
  })
  return `${input.kind === "image" ? "!" : ""}[${alt}](${url})`
}

export const unescapeAttachmentAlt = (alt: string): string =>
  alt.replace(/\\(.)/g, "$1")

export const ATTACHMENT_TRANSFORMER: TextMatchTransformer = {
  dependencies: [AttachmentNode],
  export: (node) => {
    if (!$isAttachmentNode(node)) return null
    if (node.getUploadId() !== undefined || node.getFailed()) return ""
    return formatAttachmentMarkdown({
      kind: node.getKind(),
      alt: node.getAlt(),
      url: node.getUrl(),
      width: node.getWidth(),
      density: node.getDensity()
    })
  },
  importRegExp: ATTACHMENT_MARKDOWN_RE,
  regExp: new RegExp(`${ATTACHMENT_MARKDOWN_RE.source}$`),
  replace: (textNode, match) => {
    const [, bang, rawAlt, url] = match
    if (!url || !parseAttachmentUrl(url)) {
      textNode.replace($createTextNode(match[0]))
      return
    }
    const alt = unescapeAttachmentAlt(rawAlt ?? "")
    textNode.replace(
      $createAttachmentNode({
        url: attachmentSrc(url),
        alt,
        filename: alt,
        kind: bang === "!" ? "image" : "file",
        ...attachmentViewParams(url)
      })
    )
  },
  trigger: ")",
  type: "text-match"
}
