import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypePrismPlus from "rehype-prism-plus"
import "@/lib/prism-langs"
import { cn } from "@/lib/utils"

// Read-only markdown renderer. Code blocks are highlighted via Prism — the
// same engine `@lexical/code` uses inside the editor, so colors are
// consistent across edit and read.
//
// `rehype-prism-plus` runs synchronously and ships with a curated common-langs
// set (TS/JS/CSS/HTML/Bash/JSON/YAML/...). Unknown fence labels fall through
// without erroring (`ignoreMissing: true`). The token CSS lives in styles.css
// under `.prose-md` for both palettes.

const prismPlugin = [rehypePrismPlus, { ignoreMissing: true }] as const

export function Markdown({
  children,
  className
}: {
  children: string
  className?: string
}) {
  return (
    <div className={cn("prose-md", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[prismPlugin as never]}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
