import type { ComponentProps } from "react"
import type { ExtraProps } from "react-markdown"

import { useHighlightedCode } from "../hooks/useHighlightedCode"
import { cn } from "../lib/utils"
import { codeBlockOf, numberedCodeLines } from "./markdown-highlight"

export function MarkdownCodeBlock({
  node,
  className,
  children,
  ...props
}: ComponentProps<"pre"> & ExtraProps) {
  const block = codeBlockOf(node)
  const highlighted = useHighlightedCode(block?.text ?? "", block?.language)
  if (block === null)
    return (
      <pre className={className} {...props}>
        {children}
      </pre>
    )

  return (
    <pre
      className={cn(
        className,
        highlighted !== null && `language-${block.language}`
      )}
      {...props}
    >
      <code className={cn(block.classes)}>
        {numberedCodeLines(block.text, highlighted).map(
          ({ number, tokens }) => (
            <span key={number} className="line-number" data-line={number}>
              {tokens.map(({ text, kind, offset }) =>
                kind === null ? (
                  text
                ) : (
                  <span className={`token ${kind}`} key={offset}>
                    {text}
                  </span>
                )
              )}
            </span>
          )
        )}
      </code>
    </pre>
  )
}
