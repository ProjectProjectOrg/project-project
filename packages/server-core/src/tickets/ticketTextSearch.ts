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

const plainLine = (line: string): string =>
  line
    .replace(/^\s*(#{1,6}\s+|>\s+|[-*+]\s+(\[[ xX]\]\s+)?|\d+\.\s+)/, "")
    .replace(/\[([^\]]*)\]\(mention:[^)]*\)/g, "@$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|`)/g, "")
    .trim()

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

type Candidate = Readonly<{
  line: string
  ranges: ReadonlyArray<TextRange>
  weight: number
  author: CommentBlockAuthor | null
}>

const better = (a: Candidate | null, b: Candidate | null) =>
  b !== null && (a === null || b.weight > a.weight) ? b : a

const bestLine = (
  text: string,
  words: ReadonlyArray<string>,
  author: CommentBlockAuthor | null
): Candidate | null =>
  text.split("\n").reduce<Candidate | null>((best, raw) => {
    const line = plainLine(raw)
    if (isNoise(line)) return best
    const ranges = rangesIn(line, words)
    if (ranges.length === 0) return best
    const heading = /^\s*#{1,6}\s/.test(raw)
    const weight = ranges.length * 2 - (heading ? 1 : 0)
    return better(best, { line, ranges, weight, author })
  }, null)

export const matchTicketText = (
  source: TicketTextSource,
  words: ReadonlyArray<string>
): TicketTextMatch | null => {
  if (words.length === 0) return null
  const { description, region } = splitDescriptionAndCommentsRegion(source.body)
  const comments = parseCommentsRegion(region)
  const haystack = [
    source.title,
    description,
    ...comments.map((comment) => comment.body)
  ]
    .join("\n")
    .toLowerCase()
  if (!words.every((word) => wordStartIndex(haystack, word) !== -1)) {
    return null
  }

  const inTitle = rangesIn(source.title, words).length
  if (inTitle === words.length) return { where: "title", score: 300 }

  const candidates = [
    bestLine(description, words, null),
    ...comments.map((comment) => bestLine(comment.body, words, comment.author))
  ]
  const best = candidates.reduce<Candidate | null>(better, null)
  if (best === null) return { where: "title", score: 100 + inTitle }
  const score = best.ranges.length * 10 + inTitle
  const snippet = clip(best.line, best.ranges)
  return best.author === null
    ? { where: "description", score: 200 + score, snippet }
    : { where: "comment", score: 100 + score, author: best.author, snippet }
}
