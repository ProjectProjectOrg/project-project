import logoSvg from "@pp/theme/brand/logo.svg?raw"
import wordmarkSvg from "@pp/theme/brand/wordmark.svg?raw"

// SVGs imported via Vite `?raw` at build time — static asset, never user input.

type ThemePalette = {
  drawn: string
  drawnMuted: string
  canvas: string
}

const defaultPalette: ThemePalette = {
  drawn: "var(--color-foreground)",
  drawnMuted: "var(--color-muted-foreground)",
  canvas: "var(--color-background)"
}

const invertedPalette: ThemePalette = {
  drawn: "var(--color-primary-foreground)",
  drawnMuted:
    "color-mix(in oklch, var(--color-primary-foreground) 60%, var(--color-primary) 40%)",
  canvas: "var(--color-primary)"
}

function themeSvg(raw: string, palette: ThemePalette) {
  return raw
    .replace(/fill="#FEFEFE"/g, `fill="${palette.drawn}"`)
    .replace(/fill="white"/gi, `fill="${palette.drawn}"`)
    .replace(/fill="#807F7F"/g, `fill="${palette.drawnMuted}"`)
    .replace(/fill="black"/gi, `fill="${palette.canvas}"`)
    .replace(/<svg([^>]*?)\swidth="[^"]*"/, "<svg$1")
    .replace(/<svg([^>]*?)\sheight="[^"]*"/, "<svg$1")
}

const logoMarkup = themeSvg(logoSvg, defaultPalette)
const logoMarkupInverted = themeSvg(logoSvg, invertedPalette)
const wordmarkMarkup = themeSvg(wordmarkSvg, defaultPalette)
const wordmarkMarkupInverted = themeSvg(wordmarkSvg, invertedPalette)

type Props = { className?: string; inverted?: boolean }

export function Logo({ className, inverted = false }: Props) {
  return (
    <span
      className={`inline-block [&>svg]:size-full ${className ?? ""}`}
      dangerouslySetInnerHTML={{
        __html: inverted ? logoMarkupInverted : logoMarkup
      }}
    />
  )
}

export function Wordmark({ className, inverted = false }: Props) {
  return (
    <span
      className={`inline-block [&>svg]:h-full [&>svg]:w-auto ${className ?? ""}`}
      dangerouslySetInnerHTML={{
        __html: inverted ? wordmarkMarkupInverted : wordmarkMarkup
      }}
    />
  )
}
