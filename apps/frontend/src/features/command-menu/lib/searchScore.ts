export type Searchable = Readonly<{
  label: string
  parent?: string
  prefix?: string
  keywords?: ReadonlyArray<string>
}>

const isWordStart = (text: string, index: number) =>
  index === 0 || !/[\p{L}\p{N}]/u.test(text[index - 1] ?? "")

const wordStarts = (text: string): ReadonlyArray<number> =>
  Array.from({ length: text.length }, (_, index) => index).filter(
    (index) =>
      /[\p{L}\p{N}]/u.test(text[index] ?? "") && isWordStart(text, index)
  )

const findWordStart = (text: string, word: string): number => {
  let index = text.indexOf(word)
  while (index !== -1) {
    if (isWordStart(text, index)) return index
    index = text.indexOf(word, index + 1)
  }
  return -1
}

const textScore = (
  text: string,
  word: string,
  weights: Readonly<{ start: number; contains: number }>
): number | null => {
  const at = findWordStart(text, word)
  if (at !== -1) return at === 0 ? weights.start + 10 : weights.start
  return text.includes(word) ? weights.contains : null
}

const acronymScore = (label: string, word: string): number | null => {
  if (word.length < 2) return null
  const initials = wordStarts(label)
    .map((index) => label[index])
    .join("")
  return initials.startsWith(word) ? 70 : null
}

const fuzzyFrom = (label: string, word: string, start: number): boolean => {
  let from = start
  for (const char of word) {
    const index = label.indexOf(char, from)
    if (index === -1) return false
    from = index + 1
  }
  return from - start <= word.length * 2 + 2
}

const fuzzyScore = (label: string, word: string): number | null =>
  wordStarts(label).some(
    (start) => label[start] === word[0] && fuzzyFrom(label, word, start)
  )
    ? 5
    : null

const best = (scores: ReadonlyArray<number | null>): number | null =>
  scores.reduce<number | null>(
    (top, score) =>
      score !== null && (top === null || score > top) ? score : top,
    null
  )

const wordScore = (item: Searchable, label: string, word: string) =>
  best([
    textScore(label, word, { start: 60, contains: 30 }),
    acronymScore(label, word),
    ...[item.parent, item.prefix].map((text) =>
      text === undefined
        ? null
        : textScore(text.toLowerCase(), word, { start: 40, contains: 20 })
    ),
    ...(item.keywords ?? []).map((keyword) =>
      textScore(keyword.toLowerCase(), word, { start: 15, contains: 10 })
    )
  ]) ?? fuzzyScore(label, word)

export const scoreSearch = (item: Searchable, query: string): number | null => {
  const needle = query.trim().toLowerCase()
  const words = needle.split(/\s+/).filter(Boolean)
  if (words.length === 0) return null
  const label = item.label.toLowerCase()
  const scores = words.map((word) => wordScore(item, label, word))
  if (scores.some((score) => score === null)) return null
  const bonus = label === needle ? 100 : label.startsWith(needle) ? 50 : 0
  return (
    bonus +
    scores.reduce<number>((sum, score) => sum + (score ?? 0), 0) / words.length
  )
}
