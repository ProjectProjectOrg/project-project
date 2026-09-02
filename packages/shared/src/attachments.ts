import { ULID_PATTERN } from "./schemas/Attachment"

export const ATTACHMENT_URL_PREFIX = "/api/attachments"

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

export const attachmentUrl = (orgSlug: string, id: string): string =>
  `${ATTACHMENT_URL_PREFIX}/${orgSlug}/${id}`

export interface AttachmentRef {
  readonly orgSlug: string
  readonly id: string
}

const stripQuery = (url: string): string => {
  const cut = url.search(/[?#]/)
  return cut === -1 ? url : url.slice(0, cut)
}

export const parseAttachmentUrl = (url: string): AttachmentRef | null => {
  if (!url.startsWith(`${ATTACHMENT_URL_PREFIX}/`)) return null
  const rest = stripQuery(url).slice(ATTACHMENT_URL_PREFIX.length + 1)
  const parts = rest.split("/")
  if (parts.length !== 2) return null
  const [orgSlug, id] = parts
  if (!orgSlug || !id) return null
  if (!SLUG_PATTERN.test(orgSlug)) return null
  if (!ULID_PATTERN.test(id)) return null
  return { orgSlug, id }
}

export const ATTACHMENT_WIDTH_PARAM = "w"

export const attachmentWidthFromUrl = (url: string): number | null => {
  const cut = url.indexOf("?")
  if (cut === -1) return null
  const raw = new URLSearchParams(url.slice(cut + 1)).get(
    ATTACHMENT_WIDTH_PARAM
  )
  if (raw === null) return null
  const width = Number(raw)
  if (!Number.isInteger(width) || width <= 0) return null
  return width
}

export const withAttachmentWidth = (
  url: string,
  width: number | null
): string => {
  const base = stripQuery(url)
  if (width === null || !Number.isFinite(width) || width <= 0) return base
  return `${base}?${ATTACHMENT_WIDTH_PARAM}=${Math.round(width)}`
}

const ATTACHMENT_URL_RE =
  /\/api\/attachments\/([a-z0-9]+(?:-[a-z0-9]+)*)\/([0-9A-HJKMNP-TV-Z]{26})/g

export const extractAttachmentRefs = (
  markdown: string
): ReadonlyArray<AttachmentRef> => {
  const seen = new Set<string>()
  const out: AttachmentRef[] = []
  for (const match of markdown.matchAll(ATTACHMENT_URL_RE)) {
    const orgSlug = match[1]!
    const id = match[2]!
    const key = `${orgSlug}/${id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ orgSlug, id })
  }
  return out
}
