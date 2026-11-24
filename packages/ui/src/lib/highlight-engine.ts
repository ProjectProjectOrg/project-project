import {
  codeToTokens,
  isSupportedLanguage,
  type Theme
} from "@pierre/highlights"

import {
  CODE_TOKEN_KINDS,
  type CodeToken,
  type CodeTokenKind
} from "./highlight"

const SCOPES = {
  comment: "comment",
  "tag.doctype": "comment",
  punctuation: "punctuation",
  operator: "punctuation",
  keyword: "keyword",
  preproc: "keyword",
  "variable.special": "keyword",
  "diff.minus": "keyword",
  string: "string",
  link_uri: "string",
  "diff.plus": "string",
  number: "number",
  boolean: "number",
  constant: "number",
  "string.special.symbol": "number",
  function: "function",
  type: "type",
  constructor: "type" as const,
  namespace: "type",
  enum: "type",
  variant: "type",
  tag: "tag",
  selector: "tag",
  attribute: "attribute",
  property: "attribute",
  "variable.parameter": "variable"
} satisfies Record<string, CodeTokenKind>

const PREFIX = "--code-"

const theme = {
  name: "projectproject",
  appearance: "light",
  cssVariables: { prefix: PREFIX },
  style: { syntax: SCOPES }
} satisfies Theme

const kinds = new Map(
  CODE_TOKEN_KINDS.map((kind) => [`var(${PREFIX}${kind})`, kind])
)

const lexerFor = (language: string) => {
  const lower = language.toLowerCase()
  return lower.startsWith("diff-") ? "diff" : lower
}

export const isHighlighted = (language: string) =>
  isSupportedLanguage(lexerFor(language))

export const highlightCode = (code: string, language: string) => {
  const lang = lexerFor(language)
  if (!isSupportedLanguage(lang)) return null
  return codeToTokens(code, { lang, theme }).tokens.map((line) =>
    line.reduce<Array<CodeToken>>((merged, token) => {
      const kind = kinds.get(token.color ?? "") ?? null
      const last = merged.at(-1)
      if (last?.kind === kind)
        merged[merged.length - 1] = { text: last.text + token.content, kind }
      else merged.push({ text: token.content, kind })
      return merged
    }, [])
  )
}
