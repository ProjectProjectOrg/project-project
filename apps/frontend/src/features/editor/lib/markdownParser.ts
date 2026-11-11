import type { Root } from "mdast"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import { unified } from "unified"

export const markdownPlugins = [remarkGfm]

const parser = unified().use(remarkParse).use(markdownPlugins)

export const parseMarkdown = (markdown: string): Root => parser.parse(markdown)
