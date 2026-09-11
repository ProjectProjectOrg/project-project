import { Option, Schema } from "effect"
import { AttachmentId } from "./schemas/Attachment"
import { Slug } from "./schemas/Project"

export const ATTACHMENT_URL_PREFIX = "/api/attachments"

export const attachmentUrl = (orgSlug: string, id: string): string =>
  `${ATTACHMENT_URL_PREFIX}/${orgSlug}/${id}`

export const attachmentDownloadUrl = (orgSlug: string, id: string): string =>
  `${attachmentUrl(orgSlug, id)}?download=1`

export interface AttachmentRef {
  readonly orgSlug: Slug
  readonly id: AttachmentId
}

const AttachmentRefSchema = Schema.Struct({
  orgSlug: Slug,
  id: AttachmentId
})
const decodeAttachmentRef = Schema.decodeUnknownOption(AttachmentRefSchema)

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
  const decoded = decodeAttachmentRef({ orgSlug, id })
  return Option.getOrNull(decoded)
}

const WIDTH_PARAM = "w"

const DENSITY_PARAM = "d"

const RawAttachmentViewParams = Schema.fromURLSearchParams(
  Schema.Struct({
    w: Schema.optionalKey(Schema.String),
    d: Schema.optionalKey(Schema.String)
  })
)
const PositiveIntegerFromString = Schema.FiniteFromString.check(
  Schema.makeFilter((value: number) => Number.isInteger(value), {
    expected: "an integer"
  }),
  Schema.isGreaterThan(0)
)
const decodeRawAttachmentViewParams = Schema.decodeOption(
  RawAttachmentViewParams
)
const decodeAttachmentWidth = Schema.decodeOption(PositiveIntegerFromString)

export type AttachmentDensity = "rich" | "compact"

export interface AttachmentViewParams {
  readonly width: number | null
  readonly density: AttachmentDensity
}

const searchParams = (url: string): URLSearchParams => {
  const cut = url.search(/[?#]/)
  if (cut === -1 || url[cut] === "#") return new URLSearchParams()
  return new URLSearchParams(stripQuery(url.slice(cut + 1)))
}

export const attachmentViewParams = (url: string): AttachmentViewParams => {
  const decoded = decodeRawAttachmentViewParams(searchParams(url))
  if (Option.isNone(decoded)) return { width: null, density: "rich" }
  const params = decoded.value
  const width =
    params.w === undefined ? Option.none() : decodeAttachmentWidth(params.w)
  return {
    width: Option.getOrNull(width),
    density: params.d === "compact" ? "compact" : "rich"
  }
}

export const attachmentSrc = (url: string): string => {
  const base = stripQuery(url)
  const params = searchParams(url)
  const width = params.get(WIDTH_PARAM)
  return width === null
    ? base
    : `${base}?${WIDTH_PARAM}=${encodeURIComponent(width)}`
}

export const withAttachmentParams = (
  url: string,
  params: {
    readonly width?: number | null
    readonly density?: AttachmentDensity
  }
): string => {
  const base = stripQuery(url)
  const query = new URLSearchParams()
  const width = params.width ?? null
  if (width !== null && Number.isFinite(width) && width > 0) {
    query.set(WIDTH_PARAM, String(Math.max(1, Math.round(width))))
  }
  if (params.density === "compact") {
    query.set(DENSITY_PARAM, "compact")
  }
  const encoded = query.toString()
  return encoded.length === 0 ? base : `${base}?${encoded}`
}

export const formatAttachmentMarkdown = (input: {
  readonly kind: "image" | "file"
  readonly alt: string
  readonly url: string
  readonly width?: number | null
  readonly density?: AttachmentDensity
}): string => {
  const alt = input.alt.replace(/([[\]\\*_`~&<>])/g, "\\$1")
  const url = withAttachmentParams(input.url, {
    width: input.width,
    density: input.density
  })
  return `${input.kind === "image" ? "!" : ""}[${alt}](${url})`
}

const ATTACHMENT_URL_CANDIDATE_RE = new RegExp(
  `${ATTACHMENT_URL_PREFIX}/[^\\s/]+/[0-9A-Za-z]+`,
  "g"
)

export const extractAttachmentRefs = (
  markdown: string
): ReadonlyArray<AttachmentRef> => {
  const seen = new Set<string>()
  const out: AttachmentRef[] = []
  for (const match of markdown.matchAll(ATTACHMENT_URL_CANDIDATE_RE)) {
    const ref = parseAttachmentUrl(match[0])
    if (ref === null) continue
    const key = `${ref.orgSlug}/${ref.id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(ref)
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
