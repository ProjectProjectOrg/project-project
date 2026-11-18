import { parseAttachmentUrl } from "@pp/shared"
import * as Data from "effect/Data"

import {
  ATTACHMENT_MARKDOWN_RE,
  unescapeAttachmentAlt
} from "./attachment-transformer"

export type PastedPart = Data.TaggedEnum<{
  text: { readonly value: string }
  attachment: {
    readonly kind: "image" | "file"
    readonly alt: string
    readonly url: string
  }
}>
export const PastedPart = Data.taggedEnum<PastedPart>()

const GLOBAL_RE = new RegExp(ATTACHMENT_MARKDOWN_RE.source, "g")

export const splitPastedAttachments = (text: string) => {
  const parts: Array<PastedPart> = []
  let cursor = 0
  let found = false

  GLOBAL_RE.lastIndex = 0
  for (const match of text.matchAll(GLOBAL_RE)) {
    const [whole, bang, rawAlt, url] = match
    if (url === undefined || !parseAttachmentUrl(url)) continue

    const start = match.index
    if (start > cursor) {
      parts.push(PastedPart.text({ value: text.slice(cursor, start) }))
    }
    parts.push(
      PastedPart.attachment({
        kind: bang === "!" ? "image" : "file",
        alt: unescapeAttachmentAlt(rawAlt ?? ""),
        url
      })
    )
    cursor = start + whole.length
    found = true
  }

  if (!found) return null
  if (cursor < text.length) {
    parts.push(PastedPart.text({ value: text.slice(cursor) }))
  }
  return parts
}
