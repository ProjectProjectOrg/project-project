export const CODE_TOKEN_KINDS = [
  "comment",
  "punctuation",
  "keyword",
  "string",
  "number",
  "function",
  "type",
  "tag",
  "attribute",
  "variable"
] as const

export type CodeTokenKind = (typeof CODE_TOKEN_KINDS)[number]

export type CodeToken = Readonly<{ text: string; kind: CodeTokenKind | null }>

type Highlighter = typeof import("./highlight-engine")

let highlighter: Highlighter | undefined
let loading: Promise<Highlighter> | undefined

export const getHighlighter = () => highlighter

const importHighlighter = async () => {
  try {
    highlighter = await import("./highlight-engine")
    return highlighter
  } catch (error) {
    loading = undefined
    throw error
  }
}

export const loadHighlighter = () => (loading ??= importHighlighter())
