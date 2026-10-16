import { createHash } from "node:crypto"

import matter from "gray-matter"

export const markdownFileContent = (
  frontmatter: Record<string, unknown>,
  body: string
): string => matter.stringify(body, frontmatter)

export const ticketFileBody = (description: string, region: string): string =>
  region ? `${description.replace(/\s+$/, "")}\n\n${region}` : description

export const contentHash = (content: string): string =>
  createHash("sha256").update(content).digest("hex")
