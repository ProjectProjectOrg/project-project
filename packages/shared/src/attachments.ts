import { ULID_PATTERN } from "./schemas/Attachment"

export const ATTACHMENT_URL_PREFIX = "/api/attachments"

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

export const attachmentUrl = (orgSlug: string, id: string): string =>
  `${ATTACHMENT_URL_PREFIX}/${orgSlug}/${id}`

export interface AttachmentRef {
  readonly orgSlug: string
  readonly id: string
}

export const parseAttachmentUrl = (url: string): AttachmentRef | null => {
  if (!url.startsWith(`${ATTACHMENT_URL_PREFIX}/`)) return null
  const rest = url.slice(ATTACHMENT_URL_PREFIX.length + 1)
  const parts = rest.split("/")
  if (parts.length !== 2) return null
  const [orgSlug, id] = parts
  if (!orgSlug || !id) return null
  if (!SLUG_PATTERN.test(orgSlug)) return null
  if (!ULID_PATTERN.test(id)) return null
  return { orgSlug, id }
}

const ATTACHMENT_LINK_RE = /!?\[[^\]]*\]\((\/api\/attachments\/[^)\s]*)\)/g

export const extractAttachmentRefs = (
  markdown: string
): ReadonlyArray<AttachmentRef> => {
  const seen = new Set<string>()
  const out: AttachmentRef[] = []
  for (const match of markdown.matchAll(ATTACHMENT_LINK_RE)) {
    const ref = parseAttachmentUrl(match[1]!)
    if (!ref) continue
    const key = `${ref.orgSlug}/${ref.id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(ref)
  }
  return out
}
