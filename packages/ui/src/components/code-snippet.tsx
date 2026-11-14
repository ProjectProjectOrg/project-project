import Prism from "prismjs"
import { useMemo } from "react"

import "../lib/prismLangs"
import { cn } from "../lib/utils"
import { CopyButton } from "./copy-button"

export function CodeSnippet({
  code,
  language,
  copyLabel,
  copiedLabel,
  className
}: Readonly<{
  code: string
  language: string
  copyLabel: string
  copiedLabel: string
  className?: string
}>) {
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
        copyLabel={copyLabel}
        copiedLabel={copiedLabel}
        variant="ghost"
        size="icon-sm"
        className="!absolute top-1.5 right-1.5 bg-background/80 opacity-0 backdrop-blur-sm transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 data-[copied]:opacity-100"
      />
    </div>
  )
}
