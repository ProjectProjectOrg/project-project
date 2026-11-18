import { File } from "@pierre/diffs/react"
import { cn } from "@pp/ui/lib/utils"

import { useTheme } from "./theme"

const TRANSPARENT_BACKGROUND = `
  :host, pre, code, [data-code], [data-gutter] {
    --diffs-bg: transparent !important;
    background-color: transparent !important;
  }
  code {
    overflow-x: auto !important;
  }
`

export function CodeView({
  source,
  language = "tsx",
  overflow = "scroll",
  className
}: Readonly<{
  source: string
  language?: string
  overflow?: "scroll" | "wrap"
  className?: string
}>) {
  const theme = useTheme()
  return (
    <div
      className={cn(
        "gallery-code overflow-hidden py-2 [--diffs-font-family:var(--font-mono)] [--diffs-font-size:12px] [--diffs-line-height:22px]",
        className
      )}
    >
      <File
        file={{ name: `example.${language}`, contents: source.trimEnd() }}
        options={{
          theme: { light: "pierre-light", dark: "pierre-dark" },
          themeType: theme,
          disableFileHeader: true,
          overflow,
          unsafeCSS: TRANSPARENT_BACKGROUND
        }}
      />
    </div>
  )
}
