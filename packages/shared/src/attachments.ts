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

export const ATTACHMENT_DENSITY_PARAM = "d"

export type AttachmentDensity = "rich" | "compact"

export const attachmentDensityFromUrl = (url: string): AttachmentDensity => {
  const cut = url.indexOf("?")
  if (cut === -1) return "rich"
  const raw = new URLSearchParams(url.slice(cut + 1)).get(
    ATTACHMENT_DENSITY_PARAM
  )
  return raw === "compact" ? "compact" : "rich"
}

export const withAttachmentParams = (
  url: string,
  params: {
    readonly width?: number | null
    readonly density?: AttachmentDensity
  }
): string => {
  const base = stripQuery(url)
  const query: Array<string> = []
  const width = params.width ?? null
  if (width !== null && Number.isFinite(width) && width > 0) {
    query.push(`${ATTACHMENT_WIDTH_PARAM}=${Math.round(width)}`)
  }
  if (params.density === "compact") {
    query.push(`${ATTACHMENT_DENSITY_PARAM}=compact`)
  }
  return query.length === 0 ? base : `${base}?${query.join("&")}`
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

export type AttachmentFileFormat = "pdf" | "zip" | "tar" | "gzip" | "generic"

const FORMAT_SUFFIXES: ReadonlyArray<
  readonly [suffix: string, format: AttachmentFileFormat]
> = [
  [".pdf", "pdf"],
  [".zip", "zip"],
  [".tar.gz", "gzip"],
  [".tgz", "gzip"],
  [".gz", "gzip"],
  [".gzip", "gzip"],
  [".tar", "tar"]
]

export const attachmentFileFormat = (
  filename: string
): AttachmentFileFormat => {
  const name = filename.trim().toLowerCase()
  for (const [suffix, format] of FORMAT_SUFFIXES) {
    if (name.length > suffix.length && name.endsWith(suffix)) return format
  }
  return "generic"
}
