import logoSvg from "../public/logo/logo.svg?raw"
import wordmarkSvg from "../public/logo/wordmark.svg?raw"

// The source SVGs in src/public/logo are baked for dark mode (white/grey
// shapes on a black surface). To make them themeable we swap the literal
// colors for CSS variables already defined in src/styles.css, so the same
// asset renders correctly in both light and dark mode.
//
//   #FEFEFE (white)       → var(--foreground)
//   #807F7F (mid grey)    → var(--muted-foreground)
//   black                 → var(--background)
//
// We also strip the root width/height attributes so the inline SVG scales
// to the wrapper's size class.
//
// Note: dangerouslySetInnerHTML is safe here — the SVG content is a
// build-time static asset imported via Vite's `?raw`, never user input.

function themeSvg(raw: string) {
  return raw
    .replace(/fill="#FEFEFE"/g, 'fill="var(--foreground)"')
    .replace(/fill="white"/gi, 'fill="var(--foreground)"')
    .replace(/fill="#807F7F"/g, 'fill="var(--muted-foreground)"')
    .replace(/fill="black"/gi, 'fill="var(--background)"')
    .replace(/<svg([^>]*?)\swidth="[^"]*"/, "<svg$1")
    .replace(/<svg([^>]*?)\sheight="[^"]*"/, "<svg$1")
}

const logoMarkup = themeSvg(logoSvg)
const wordmarkMarkup = themeSvg(wordmarkSvg)

type Props = { className?: string }

export function Logo({ className }: Props) {
  return (
    <span
      className={`inline-block [&>svg]:size-full ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: logoMarkup }}
    />
  )
}

export function Wordmark({ className }: Props) {
  return (
    <span
      className={`inline-block [&>svg]:h-full [&>svg]:w-auto ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: wordmarkMarkup }}
    />
  )
}
