export type PageMetadata = Readonly<{
  title: string | null
  faviconUrl: string | null
}>

const TITLE_MAX = 300

const TARGET_ICON_SIZE = 32
const SCALABLE_ICON_SCORE = -1
const UNKNOWN_ICON_SIZE_SCORE = 16

const NAMED_ENTITIES: ReadonlyMap<string, string> = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
  ["nbsp", " "],
  ["ndash", "–"],
  ["mdash", "—"],
  ["hellip", "…"],
  ["middot", "·"],
  ["laquo", "«"],
  ["raquo", "»"],
  ["lsquo", "‘"],
  ["rsquo", "’"],
  ["ldquo", "“"],
  ["rdquo", "”"],
  ["bull", "•"],
  ["copy", "©"],
  ["reg", "®"],
  ["trade", "™"]
])

const fromCodePoint = (code: number, raw: string): string =>
  Number.isInteger(code) && code > 0 && code <= 0x10ffff
    ? String.fromCodePoint(code)
    : raw

const decodeEntities = (text: string): string =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (raw, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      return fromCodePoint(Number.parseInt(entity.slice(2), 16), raw)
    }
    if (entity.startsWith("#")) {
      return fromCodePoint(Number.parseInt(entity.slice(1), 10), raw)
    }
    return NAMED_ENTITIES.get(entity.toLowerCase()) ?? raw
  })

const cleanTitle = (raw: string | undefined): string | null => {
  if (raw === undefined) return null
  const title = decodeEntities(raw).replace(/\s+/g, " ").trim()
  if (title.length === 0) return null
  return title.length > TITLE_MAX
    ? `${title.slice(0, TITLE_MAX - 1).trimEnd()}…`
    : title
}

const attributes = (source: string): ReadonlyMap<string, string> => {
  const found = new Map<string, string>()
  for (const match of source.matchAll(
    /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g
  )) {
    const name = match[1]?.toLowerCase()
    if (name === undefined || found.has(name)) continue
    found.set(name, decodeEntities(match[2] ?? match[3] ?? match[4] ?? ""))
  }
  return found
}

const headOf = (html: string): string => {
  const withoutNoise = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, "")
  const end = withoutNoise.search(/<\/head\s*>|<body\b/i)
  return end === -1 ? withoutNoise : withoutNoise.slice(0, end)
}

const resolveHttpUrl = (href: string, base: URL): URL | null => {
  try {
    const url = new URL(href.trim(), base)
    return url.protocol === "http:" || url.protocol === "https:" ? url : null
  } catch {
    return null
  }
}

type IconCandidate = Readonly<{ url: URL; score: number }>

const iconScore = (tag: ReadonlyMap<string, string>, url: URL): number => {
  const sizes = (tag.get("sizes") ?? "").toLowerCase()
  if (
    sizes.split(/\s+/).includes("any") ||
    tag.get("type") === "image/svg+xml" ||
    url.pathname.toLowerCase().endsWith(".svg")
  ) {
    return SCALABLE_ICON_SCORE
  }
  const dimensions = [...sizes.matchAll(/(\d+)x\d+/g)].map((m) => Number(m[1]))
  if (dimensions.length === 0) return UNKNOWN_ICON_SIZE_SCORE
  return Math.min(...dimensions.map((d) => Math.abs(d - TARGET_ICON_SIZE)))
}

const bestIcon = (candidates: ReadonlyArray<IconCandidate>): URL | null =>
  candidates.reduce<IconCandidate | null>(
    (best, candidate) =>
      best === null || candidate.score < best.score ? candidate : best,
    null
  )?.url ?? null

export const parsePageMetadata = (html: string, pageUrl: URL): PageMetadata => {
  const head = headOf(html)
  const tags = [...head.matchAll(/<(meta|link|base)\b([^>]*)>/gi)].map(
    (match) => ({
      name: match[1]?.toLowerCase() ?? "",
      attrs: attributes(match[2] ?? "")
    })
  )

  const baseHref = tags.find((tag) => tag.name === "base")?.attrs.get("href")
  const base =
    baseHref === undefined
      ? pageUrl
      : (resolveHttpUrl(baseHref, pageUrl) ?? pageUrl)

  const metaContent = (key: string): string | undefined =>
    tags
      .find(
        (tag) =>
          tag.name === "meta" &&
          (
            tag.attrs.get("property") ?? tag.attrs.get("name")
          )?.toLowerCase() === key
      )
      ?.attrs.get("content")

  const title =
    cleanTitle(metaContent("og:title")) ??
    cleanTitle(metaContent("twitter:title")) ??
    cleanTitle(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(head)?.[1])

  const icons: Array<IconCandidate> = []
  const touchIcons: Array<IconCandidate> = []
  for (const tag of tags) {
    if (tag.name !== "link") continue
    const href = tag.attrs.get("href")
    if (href === undefined) continue
    const url = resolveHttpUrl(href, base)
    if (url === null) continue
    const rel = (tag.attrs.get("rel") ?? "").toLowerCase().split(/\s+/)
    if (rel.includes("icon"))
      icons.push({ url, score: iconScore(tag.attrs, url) })
    else if (
      rel.includes("apple-touch-icon") ||
      rel.includes("apple-touch-icon-precomposed")
    ) {
      touchIcons.push({ url, score: iconScore(tag.attrs, url) })
    }
  }

  const icon = bestIcon(icons) ?? bestIcon(touchIcons)
  return {
    title,
    faviconUrl: icon?.href ?? defaultFaviconUrl(pageUrl)
  }
}

export const defaultFaviconUrl = (pageUrl: URL): string =>
  new URL("/favicon.ico", pageUrl.origin).href
