"use client"

import Prism from "prismjs"
import { useMemo } from "react"
import "@/lib/prism-langs"
import { CopyButton } from "@/components/ui/copy-button"
import { cn } from "@/lib/utils"

// Inline syntax-highlighted code block with an overlay copy button. Uses
// the same Prism token palette as the read-side Markdown component by
// wrapping the <pre> in `.prose-md` — so a snippet shown here and the same
// snippet inside a markdown body render identically.
//
// The copy button is positioned on the outer wrapper, not inside `.prose-md`,
// to avoid the `.prose-md > * + *` sibling margin and to anchor cleanly
// against the relative outer container regardless of the Button's own
// CVA-applied `position` class.

export function CodeSnippet({
  code,
  language,
  className
}: {
  code: string
  language: string
  className?: string
}) {
  const html = useMemo(() => {
    const grammar = Prism.languages[language] ?? Prism.languages.plain
    return Prism.highlight(code, grammar, language)
  }, [code, language])

  return (
    <div className={cn("group relative", className)}>
      <div className="prose-md">
        <pre className={`language-${language} !my-0 !pr-10`}>
          <code
            className={`language-${language}`}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </pre>
      </div>
      <CopyButton
        value={code}
        variant="ghost"
        size="icon-sm"
        className="!absolute right-1.5 top-1.5 bg-background/80 backdrop-blur-sm opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 data-[copied]:opacity-100"
      />
    </div>
  )
}
