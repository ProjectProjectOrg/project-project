import type { ThemedToken } from "@pierre/diffs"
import { cn } from "@pp/ui/lib/utils"
import { useEffect, useState, type ComponentProps } from "react"

import { guessLanguage, tokenizeLine } from "./highlighter"

const textOf = (children: ComponentProps<"code">["children"]) =>
  typeof children === "string" ? children : null

export function InlineCode({
  className,
  children,
  ...props
}: ComponentProps<"code">) {
  const text = textOf(children)
  const [tokens, setTokens] = useState<ReadonlyArray<ThemedToken> | null>(null)

  useEffect(() => {
    if (text === null) return
    let cancelled = false
    void tokenizeLine(text, guessLanguage(text)).then((next) => {
      if (!cancelled) setTokens(next)
    })
    return () => {
      cancelled = true
    }
  }, [text])

  return (
    <code
      className={cn(
        "gallery-inline-code inline-chip rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-body",
        className
      )}
      {...props}
    >
      {tokens === null
        ? children
        : tokens.map((token, index) => (
            <span key={index} style={token.htmlStyle}>
              {token.content}
            </span>
          ))}
    </code>
  )
}
