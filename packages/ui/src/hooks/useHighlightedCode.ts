import { useEffect, useMemo, useState } from "react"

import { getHighlighter, loadHighlighter } from "../lib/highlight"

export function useHighlightedCode(text: string, language: string | undefined) {
  const [highlighter, setHighlighter] = useState(getHighlighter)
  useEffect(() => {
    if (!language || language === "plain" || highlighter !== undefined)
      return undefined
    let active = true
    void loadHighlighter().then(
      (loaded) => {
        if (active) setHighlighter(loaded)
      },
      () => {}
    )
    return () => {
      active = false
    }
  }, [highlighter, language])

  return useMemo(
    () =>
      language && highlighter
        ? highlighter.highlightCode(text, language)
        : null,
    [highlighter, language, text]
  )
}
