import { useMemo } from "react"

import { highlightCode, type CodeToken } from "../lib/highlight"
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
  const tokens = useMemo(() => {
    const lines = highlightCode(code, language) ?? [
      [{ text: code, kind: null }]
    ]
    const newline: CodeToken = { text: "\n", kind: null }
    return lines
      .flatMap((line, index) => (index === 0 ? line : [newline].concat(line)))
      .reduce<Array<CodeToken & Readonly<{ offset: number }>>>(
        (placed, { text, kind }) => {
          placed.push({
            text,
            kind,
            offset: (placed.at(-1)?.offset ?? 0) + text.length
          })
          return placed
        },
        []
      )
  }, [code, language])

  return (
    <div className={cn("group relative", className)}>
      <div className="prose-md">
        <pre className={`language-${language} !my-0 !pr-10`}>
          <code className={`language-${language}`}>
            {tokens.map(({ text, kind, offset }) => (
              <span
                key={offset}
                className={kind === null ? undefined : `token ${kind}`}
              >
                {text}
              </span>
            ))}
          </code>
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
