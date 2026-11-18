// @effect-diagnostics-next-line nodeBuiltinImport:off
import { createHash } from "node:crypto"

import matter from "gray-matter"

export const parseMarkdownFile = (content: string) => {
  const parsed = matter(content, {
    engines: {
      javascript: () => {
        throw new Error("JavaScript frontmatter is not supported")
      }
    }
  })
  const data: Record<string, unknown> = parsed.data
  return { data, content: parsed.content }
}

export const markdownFileContent = (
  frontmatter: Record<string, unknown>,
  body: string
) => {
  const content = matter.stringify({ content: body }, frontmatter)
  return Object.keys(frontmatter).length === 0 && /^\uFEFF?---(?!-)/.test(body)
    ? `---\n---\n${content}`
    : content
}

export const ticketFileBody = (description: string, region: string) =>
  region ? `${description.replace(/\s+$/, "")}\n\n${region}` : description

export const contentHash = (content: string) =>
  createHash("sha256").update(content).digest("hex")
