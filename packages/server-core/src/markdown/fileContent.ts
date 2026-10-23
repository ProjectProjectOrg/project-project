// @effect-diagnostics-next-line nodeBuiltinImport:off
import { createHash } from "node:crypto"

import matter from "gray-matter"

export const parseMarkdownFile = (
  content: string
): Readonly<{ data: Record<string, unknown>; content: string }> => {
  const parsed = matter(content, {
    engines: {
      javascript: () => {
        throw new Error("JavaScript frontmatter is not supported")
      }
    }
  })
  return { data: parsed.data, content: parsed.content }
}

export const markdownFileContent = (
  frontmatter: Record<string, unknown>,
  body: string
): string => {
  const content = matter.stringify({ content: body }, frontmatter)
  return Object.keys(frontmatter).length === 0 && /^\uFEFF?---(?!-)/.test(body)
    ? `---\n---\n${content}`
    : content
}

export const ticketFileBody = (description: string, region: string): string =>
  region ? `${description.replace(/\s+$/, "")}\n\n${region}` : description

export const contentHash = (content: string): string =>
  createHash("sha256").update(content).digest("hex")
