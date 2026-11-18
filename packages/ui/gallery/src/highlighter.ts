import { getSharedHighlighter } from "@pierre/diffs"

export type InlineLanguage = "tsx" | "css"

export const guessLanguage = (code: string) =>
  /^[a-z-]+:\s/.test(code) ? "css" : "tsx"

export async function tokenizeLine(code: string, lang: InlineLanguage) {
  const highlighter = await getSharedHighlighter({
    themes: ["pierre-light", "pierre-dark"],
    langs: [lang]
  })
  const result = highlighter.codeToTokens(code, {
    lang,
    themes: { light: "pierre-light", dark: "pierre-dark" },
    defaultColor: false
  })
  return result.tokens[0] ?? []
}
