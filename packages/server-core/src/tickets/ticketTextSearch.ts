import type { TextRange, TicketTextSnippet } from "@pp/shared"

import {
  parseCommentsRegion,
  splitDescriptionAndCommentsRegion,
  type CommentBlockAuthor
} from "../comments/comments-region"

export type TicketTextSource = Readonly<{
  title: string
  body: string
}>

export type TicketTextMatch =
  | Readonly<{ where: "title"; score: number }>
  | Readonly<{
      where: "description"
      score: number
      snippet: TicketTextSnippet
    }>
  | Readonly<{
      where: "comment"
      score: number
      author: CommentBlockAuthor
      snippet: TicketTextSnippet
    }>

const SNIPPET_LENGTH = 120
const SNIPPET_LEAD = 40

export const searchWords = (query: string): ReadonlyArray<string> => [
  ...new Set(query.trim().toLowerCase().split(/\s+/).filter(Boolean))
]

const plainProse = (text: string): string => {
  if (!/\[|\*\*|__/.test(text)) return text
  return text
    .replace(/\[([^\]]*)\]\(mention:[^)]*\)/g, "@$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)/g, "")
}

const plainLine = (line: string): string => {
  const text = line.replace(
    /^\s*(#{1,6}\s+|>\s+|[-*+]\s+(\[[ xX]\]\s+)?|\d+\.\s+)/,
    ""
  )
  if (!text.includes("`")) return plainProse(text).trim()
  return text
    .split(/(`[^`]+`)/)
    .map((part) =>
      part.startsWith("`") ? part.slice(1, -1) : plainProse(part)
    )
    .join("")
    .trim()
}

const linkKey = (url: string): string =>
  url
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")

const linkTargets = (line: string): ReadonlyArray<string> =>
  [...line.matchAll(/\]\((?!mention:)([^)\s]+)[^)]*\)/g)].map(([, target]) =>
    linkKey(target ?? "")
  )

const linkedCount = (
  links: ReadonlyArray<string>,
  words: ReadonlyArray<string>
): number =>
  words.filter((word) => {
    const key = word.includes("://") ? linkKey(word) : ""
    return key !== "" && links.some((link) => link.startsWith(key))
  }).length

const isFence = (line: string) => /^\s*(```|~~~)/.test(line)

const isNoise = (line: string) =>
  line === "" || /^<\/?block\b/.test(line) || line.startsWith("<!--")

const WORD_CHAR = /[\p{L}\p{N}]/u

const wordStartIndex = (lower: string, word: string): number => {
  let at = lower.indexOf(word)
  while (at > 0 && WORD_CHAR.test(lower[at - 1] ?? "")) {
    at = lower.indexOf(word, at + 1)
  }
  return at
}

const rangesIn = (
  text: string,
  words: ReadonlyArray<string>
): ReadonlyArray<TextRange> => {
  const lower = text.toLowerCase()
  return words
    .flatMap((word): ReadonlyArray<TextRange> => {
      const at = wordStartIndex(lower, word)
      return at === -1 ? [] : [[at, at + word.length]]
    })
    .toSorted((a, b) => a[0] - b[0])
}

const clip = (
  text: string,
  ranges: ReadonlyArray<TextRange>
): TicketTextSnippet => {
  if (text.length <= SNIPPET_LENGTH) return { text, ranges }
  const first = ranges[0]?.[0] ?? 0
  const start = Math.max(
    0,
    Math.min(first - SNIPPET_LEAD, text.length - SNIPPET_LENGTH)
  )
  const end = Math.min(text.length, start + SNIPPET_LENGTH)
  const lead = start > 0 ? "…" : ""
  const shift = lead.length - start
  return {
    text: `${lead}${text.slice(start, end)}${end < text.length ? "…" : ""}`,
    ranges: ranges.flatMap(
      ([from, to]): ReadonlyArray<TextRange> =>
        from >= start && to <= end ? [[from + shift, to + shift]] : []
    )
  }
}

type Line = Readonly<{
  text: string
  links: ReadonlyArray<string>
  heading: boolean
  author: CommentBlockAuthor | null
}>

const visibleLines = (
  text: string,
  author: CommentBlockAuthor | null,
  searchLinks: boolean
): ReadonlyArray<Line> => {
  const lines: Array<Line> = []
  let fenced = false
  for (const raw of text.split("\n")) {
    if (isFence(raw)) {
      fenced = !fenced
      continue
    }
    if (fenced) {
      const code = raw.trim()
      if (code !== "") {
        lines.push({ text: code, links: [], heading: false, author })
      }
      continue
    }
    const line = plainLine(raw)
    if (isNoise(line)) continue
    lines.push({
      text: line,
      links: searchLinks ? linkTargets(raw) : [],
      heading: /^\s*#{1,6}\s/.test(raw),
      author
    })
  }
  return lines
}

type Candidate = Readonly<{
  line: Line
  ranges: ReadonlyArray<TextRange>
  weight: number
}>

const bestLine = (
  lines: ReadonlyArray<Line>,
  words: ReadonlyArray<string>
): Candidate | null =>
  lines.reduce<Candidate | null>((best, line) => {
    const ranges = rangesIn(line.text, words)
    const linked = linkedCount(line.links, words)
    if (ranges.length === 0 && linked === 0) return best
    const weight = ranges.length * 4 + linked - (line.heading ? 1 : 0)
    return best === null || weight > best.weight
      ? { line, ranges, weight }
      : best
  }, null)

export const matchTicketText = (
  source: TicketTextSource,
  words: ReadonlyArray<string>
): TicketTextMatch | null => {
  if (words.length === 0) return null
  const inTitle = rangesIn(source.title, words).length
  if (inTitle === words.length) return { where: "title", score: 300 }

  const lower = `${source.title}\n${source.body}`.toLowerCase()
  let missing = words.filter(
    (word) => !word.includes("://") && !lower.includes(word)
  )
  if (missing.length > 0) {
    if (!/`|\[|\*\*|__/.test(source.body)) return null
    for (const line of source.body.split("\n")) {
      if (!/`|\[|\*\*|__/.test(line)) continue
      const visible = plainLine(line).toLowerCase()
      missing = missing.filter((word) => !visible.includes(word))
      if (missing.length === 0) break
    }
    if (missing.length > 0) return null
  }

  const searchLinks = words.some((word) => word.includes("://"))
  const { description, region } = splitDescriptionAndCommentsRegion(source.body)
  const lines = [
    ...visibleLines(description, null, searchLinks),
    ...parseCommentsRegion(region).flatMap((comment) =>
      visibleLines(comment.body, comment.author, searchLinks)
    )
  ]
  const haystack = [source.title, ...lines.map((line) => line.text)]
    .join("\n")
    .toLowerCase()
  const links = lines.flatMap((line) => line.links)
  const found = (word: string) =>
    wordStartIndex(haystack, word) !== -1 || linkedCount(links, [word]) === 1
  if (!words.every(found)) return null

  const best = bestLine(lines, words)
  if (best === null) return null
  const score = best.ranges.length * 10 + inTitle
  const snippet = clip(best.line.text, best.ranges)
  return best.line.author === null
    ? { where: "description", score: 200 + score, snippet }
    : {
        where: "comment",
        score: 100 + score,
        author: best.line.author,
        snippet
      }
}
