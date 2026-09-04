import { parseAttachmentUrl } from "@projectproject/shared"
import {
  ATTACHMENT_MARKDOWN_RE,
  unescapeAttachmentAlt
} from "./attachmentTransformer"

export type PastedPart =
  | { readonly type: "text"; readonly value: string }
  | {
      readonly type: "attachment"
      readonly kind: "image" | "file"
      readonly alt: string
      readonly url: string
    }

const GLOBAL_RE = new RegExp(ATTACHMENT_MARKDOWN_RE.source, "g")

export const splitPastedAttachments = (
  text: string
): ReadonlyArray<PastedPart> | null => {
  const parts: Array<PastedPart> = []
  let cursor = 0
  let found = false

  GLOBAL_RE.lastIndex = 0
  for (const match of text.matchAll(GLOBAL_RE)) {
    const [whole, bang, rawAlt, url] = match
    if (url === undefined || !parseAttachmentUrl(url)) continue

    const start = match.index
    if (start > cursor) {
      parts.push({ type: "text", value: text.slice(cursor, start) })
    }
    parts.push({
      type: "attachment",
      kind: bang === "!" ? "image" : "file",
      alt: unescapeAttachmentAlt(rawAlt ?? ""),
      url
    })
    cursor = start + whole.length
    found = true
  }

  if (!found) return null
  if (cursor < text.length) {
    parts.push({ type: "text", value: text.slice(cursor) })
  }
  return parts
}
